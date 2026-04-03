const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Path to yt-dlp and ffmpeg
const YTDLP_PATH = 'C:\\Users\\POSS\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';
const FFMPEG_PATH = 'C:\\Users\\POSS\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin';

// API Keys Database (In production, use a real database)
const API_KEYS = {
    'demo_key_123': {
        name: 'Demo Account',
        tier: 'free',
        requestsPerDay: 50,
        requestsToday: 0,
        lastReset: new Date().toDateString()
    },
    'premium_key_456': {
        name: 'Premium Account',
        tier: 'premium',
        requestsPerDay: 1000,
        requestsToday: 0,
        lastReset: new Date().toDateString()
    }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rate limiting by API key
function checkRateLimit(apiKey) {
    const keyData = API_KEYS[apiKey];
    if (!keyData) return { valid: false, message: 'Invalid API key' };

    // Reset counter if new day
    const today = new Date().toDateString();
    if (keyData.lastReset !== today) {
        keyData.requestsToday = 0;
        keyData.lastReset = today;
    }

    // Check limit
    if (keyData.requestsToday >= keyData.requestsPerDay) {
        return { valid: false, message: 'Rate limit exceeded. Upgrade your plan.' };
    }

    keyData.requestsToday++;
    return { valid: true, remaining: keyData.requestsPerDay - keyData.requestsToday };
}

// Middleware to validate API key
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required',
            message: 'Please provide an API key in X-API-Key header or api_key query parameter'
        });
    }

    const rateCheck = checkRateLimit(apiKey);
    if (!rateCheck.valid) {
        return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: rateCheck.message
        });
    }

    req.apiKey = apiKey;
    req.apiKeyData = API_KEYS[apiKey];
    req.remainingRequests = rateCheck.remaining;
    next();
}

// ========== PUBLIC API ENDPOINTS ==========

// API Documentation
app.get('/api/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-docs.html'));
});

// API Status & Health Check
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        version: '2.0.0',
        endpoints: {
            '/api/video/info': 'Get video information',
            '/api/video/download': 'Download video',
            '/api/platforms': 'List supported platforms'
        },
        documentation: '/api/docs'
    });
});

// List supported platforms
app.get('/api/platforms', validateApiKey, (req, res) => {
    res.json({
        success: true,
        platforms: [
            { name: 'YouTube', supported: true, formats: ['video', 'audio'], tested: true },
            { name: 'YouTube Shorts', supported: true, formats: ['video'], tested: true },
            { name: 'TikTok', supported: true, formats: ['video'], tested: true },
            { name: 'Vimeo', supported: true, formats: ['video'], tested: true }
        ],
        note: 'All platforms have been tested and verified. Instagram, Facebook, Twitter, and Dailymotion require authentication and are not currently supported.',
        remaining_requests: req.remainingRequests
    });
});

// Get video information (supports multiple platforms)
app.post('/api/video/info', validateApiKey, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required',
                message: 'Please provide a video URL in the request body'
            });
        }

        console.log('API Request - Video Info:', { url, apiKey: req.apiKey });

        // Use yt-dlp to get video info (supports many platforms)
        const command = `"${YTDLP_PATH}" --js-runtimes node --dump-json --no-warnings "${url}"`;
        const { stdout } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 });
        const videoData = JSON.parse(stdout);

        // Extract formats
        const formats = (videoData.formats || [])
            .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
            .map(f => ({
                format_id: f.format_id,
                quality: f.height || f.quality,
                qualityLabel: f.format_note || (f.height ? `${f.height}p` : 'unknown'),
                hasVideo: true,
                hasAudio: f.acodec && f.acodec !== 'none',
                container: f.ext || 'mp4',
                filesize: f.filesize || f.filesize_approx,
                fps: f.fps
            }))
            .filter((format, index, self) =>
                index === self.findIndex((f) => f.qualityLabel === format.qualityLabel)
            )
            .sort((a, b) => (b.quality || 0) - (a.quality || 0));

        res.json({
            success: true,
            data: {
                title: videoData.title,
                author: videoData.uploader || videoData.channel,
                duration: videoData.duration,
                views: videoData.view_count,
                uploadDate: videoData.upload_date,
                thumbnail: videoData.thumbnail,
                description: videoData.description,
                platform: videoData.extractor || 'unknown',
                formats: formats
            },
            remaining_requests: req.remainingRequests
        });

    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video information',
            message: error.message
        });
    }
});

// Download video endpoint
app.post('/api/video/download', validateApiKey, async (req, res) => {
    try {
        const { url, quality = '720p', format = 'mp4' } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        console.log('API Request - Download:', { url, quality, format, apiKey: req.apiKey });

        // Get video title
        const infoCommand = `"${YTDLP_PATH}" --js-runtimes node --get-title --no-warnings "${url}"`;
        const { stdout: titleOutput } = await execPromise(infoCommand);
        const title = titleOutput.trim().replace(/[^\w\s.-]/gi, '_');

        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${title}.${format}"`);
        res.setHeader('Content-Type', `video/${format}`);
        res.setHeader('X-Remaining-Requests', req.remainingRequests);

        // Format selection based on platform
        let formatSelection;
        const isTikTok = url.includes('tiktok.com');

        if (isTikTok) {
            // TikTok: Download without watermark using h264 format
            // Format codes: download_addr = no watermark, play_addr = with watermark
            formatSelection = 'best[ext=mp4]/best';
        } else if (quality === '360p') {
            formatSelection = '18/bestvideo[height<=360][vcodec^=avc]+bestaudio/best';
        } else {
            const maxHeight = quality.replace('p', '');
            formatSelection = `bestvideo[height<=${maxHeight}][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=${maxHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxHeight}]+bestaudio/best`;
        }

        // Start download
        const args = [
            '--js-runtimes', 'node',
            '--ffmpeg-location', FFMPEG_PATH,
            '-f', formatSelection,
            '--recode-video', format,
            '-o', '-',
            '--no-warnings'
        ];

        // Add TikTok-specific options for watermark removal
        if (isTikTok) {
            args.push('--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com');
        }

        args.push(url);

        const ytdlp = spawn(YTDLP_PATH, args);
        ytdlp.stdout.pipe(res);

        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString();
            if (!msg.includes('Downloading') && !msg.includes('[download]')) {
                console.error('yt-dlp:', msg);
            }
        });

        ytdlp.on('error', (error) => {
            console.error('Download error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Download failed',
                    message: error.message
                });
            }
        });

        req.on('close', () => {
            ytdlp.kill();
        });

    } catch (error) {
        console.error('Error downloading video:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Download failed',
                message: error.message
            });
        }
    }
});

// Generate API key endpoint (for demo purposes - in production, use proper registration)
app.post('/api/keys/generate', async (req, res) => {
    const { email, name, tier = 'free' } = req.body;

    if (!email || !name) {
        return res.status(400).json({
            success: false,
            error: 'Email and name are required'
        });
    }

    // Generate unique API key
    const apiKey = `${tier}_${crypto.randomBytes(16).toString('hex')}`;

    const limits = {
        free: 50,
        basic: 500,
        premium: 1000,
        enterprise: 10000
    };

    API_KEYS[apiKey] = {
        name,
        email,
        tier,
        requestsPerDay: limits[tier] || 50,
        requestsToday: 0,
        lastReset: new Date().toDateString(),
        createdAt: new Date().toISOString()
    };

    res.json({
        success: true,
        message: 'API key generated successfully',
        data: {
            api_key: apiKey,
            tier: tier,
            requests_per_day: limits[tier],
            created_at: new Date().toISOString()
        }
    });
});

// ========== MAIN WEBSITE ROUTES ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api-service', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-service.html'));
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'pricing.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'contact.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║   🚀 YTD API Service Running                     ║
    ║                                                   ║
    ║   Server:      http://localhost:${PORT}           ║
    ║   Status:      ✓ Operational                     ║
    ║   API Docs:    http://localhost:${PORT}/api/docs ║
    ║   API Service: http://localhost:${PORT}/api-service ║
    ║                                                   ║
    ║   Demo API Key: demo_key_123                     ║
    ║   (50 requests/day)                              ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
    `);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});
