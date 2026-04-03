const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// On Linux (Render), yt-dlp and ffmpeg are installed via build command
// On Windows (local), use full paths
const IS_WINDOWS = process.platform === 'win32';
const YTDLP_PATH = IS_WINDOWS
    ? 'C:\\Users\\POSS\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe'
    : 'yt-dlp';
const FFMPEG_PATH = IS_WINDOWS
    ? 'C:\\Users\\POSS\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin'
    : null; // ffmpeg is in PATH on Linux

// Cookies file path (optional - place cookies.txt in project root to bypass bot detection)
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const COOKIES_FLAG = fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';

// Admin config
const ADMIN_PASSWORD = 'Layyah@3413';
const ADMIN_TOKEN = 'ytd_admin_' + Buffer.from(ADMIN_PASSWORD).toString('base64');
const POSTS_DB = path.join(__dirname, 'admin', 'posts.json');

// Ensure posts.json exists
if (!fs.existsSync(POSTS_DB)) fs.writeFileSync(POSTS_DB, '[]');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ========== Admin Auth Middleware ==========
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token === ADMIN_TOKEN) return next();
    // Check cookie
    const cookies = req.headers.cookie || '';
    if (cookies.includes(`admin_token=${ADMIN_TOKEN}`)) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// ========== Admin Routes ==========

// Serve admin login page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/admin/new-post', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'post-editor.html'));
});

app.get('/admin/edit-post', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'post-editor.html'));
});

// Login
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Logout
app.post('/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.json({ success: true });
});

// Get all posts
app.get('/admin/api/posts', requireAdmin, (req, res) => {
    const posts = JSON.parse(fs.readFileSync(POSTS_DB));
    res.json(posts.map(p => ({ slug: p.slug, title: p.title, category: p.category, date: p.date, status: p.status })));
});

// Get single post
app.get('/admin/api/posts/:slug', requireAdmin, (req, res) => {
    const posts = JSON.parse(fs.readFileSync(POSTS_DB));
    const post = posts.find(p => p.slug === req.params.slug);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
});

// Create or update post
app.post('/admin/api/posts', requireAdmin, (req, res) => {
    try {
        const { slug, title, content, status, category, readTime, author, featuredImage, metaDesc } = req.body;
        const posts = JSON.parse(fs.readFileSync(POSTS_DB));
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const postData = { slug, title, content, status, category, readTime, author, featuredImage, metaDesc, date };

        const idx = posts.findIndex(p => p.slug === slug);
        if (idx >= 0) posts[idx] = postData;
        else posts.unshift(postData);

        fs.writeFileSync(POSTS_DB, JSON.stringify(posts, null, 2));

        // Generate HTML file if published
        if (status === 'published') {
            generateBlogHTML(postData);
            updateBlogListing(posts.filter(p => p.status === 'published'));
        }

        res.json({ success: true, slug });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete post
app.delete('/admin/api/posts/:slug', requireAdmin, (req, res) => {
    try {
        let posts = JSON.parse(fs.readFileSync(POSTS_DB));
        posts = posts.filter(p => p.slug !== req.params.slug);
        fs.writeFileSync(POSTS_DB, JSON.stringify(posts, null, 2));
        // Remove HTML file
        const htmlPath = path.join(__dirname, 'blogs', `${req.params.slug}.html`);
        if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
        updateBlogListing(posts.filter(p => p.status === 'published'));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate blog post HTML file
function generateBlogHTML(post) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${(post.metaDesc || '').replace(/"/g, '&quot;')}">
    <title>${post.title} | VideoSavez Blog</title>
    <meta name="robots" content="index, follow">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles-advanced.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
</head>
<body>
    <div class="grid-bg"></div>
    <div class="particles">${Array(10).fill('<div class="particle"></div>').join('')}</div>
    <div class="container">
        <header class="header">
            <div class="logo"><i class="fab fa-youtube"></i><span>VideoSavez</span></div>
            <nav class="nav-links">
                <a href="../index.html">Home</a>
                <a href="../blog.html">Blog</a>
                <a href="../api-service.html">API</a>
                <a href="../pricing.html">Pricing</a>
                <a href="../contact.html">Contact</a>
            </nav>
        </header>

        <article class="blog-post glass-card" style="padding: 60px;">
            <div class="blog-post-header">
                <h1 class="blog-post-title">${post.title}</h1>
                <div class="blog-post-meta">
                    <span><i class="fas fa-calendar"></i> ${post.date}</span>
                    <span><i class="fas fa-user"></i> ${post.author || 'Cyber Vision Team'}</span>
                    ${post.readTime ? `<span><i class="fas fa-clock"></i> ${post.readTime}</span>` : ''}
                    ${post.category ? `<span><i class="fas fa-tag"></i> ${post.category}</span>` : ''}
                </div>
            </div>
            ${post.featuredImage ? `<img src="${post.featuredImage}" alt="${post.title}" class="blog-post-image">` : ''}

            <!-- AD SLOT: In-Article -->
            <div class="ad-slot ad-rectangle" style="margin: 40px auto;">
                <span class="ad-label">Advertisement</span>
                <ins class="adsbygoogle ad-unit" style="display:block;text-align:center;"
                     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                     data-ad-slot="4455667788"
                     data-ad-format="fluid"
                     data-ad-layout="in-article"
                     data-full-width-responsive="true"></ins>
            </div>

            <div class="blog-post-content">${post.content}</div>
        </article>

        <!-- AD SLOT: Footer Banner -->
        <div class="ad-slot ad-leaderboard">
            <span class="ad-label">Advertisement</span>
            <ins class="adsbygoogle ad-unit" style="display:block"
                 data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                 data-ad-slot="5566778899"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
        </div>

        <footer class="footer" style="margin-top: 80px;">
            <p>&copy; 2026 Cyber Vision Technologies. Made with <i class="fas fa-heart"></i> for video lovers</p>
            <p class="disclaimer">Disclaimer: Please respect copyright laws and use this tool responsibly.</p>
        </footer>
    </div>
</body>
</html>`;
    fs.writeFileSync(path.join(__dirname, 'blogs', `${post.slug}.html`), html);
}

// Update blog.html listing with new posts (appends dynamic posts section)
function updateBlogListing(publishedPosts) {
    // Just regenerate the dynamic posts data file for the blog page
    const data = publishedPosts.map(p => ({
        slug: p.slug, title: p.title, category: p.category,
        date: p.date, readTime: p.readTime, featuredImage: p.featuredImage,
        excerpt: p.metaDesc || ''
    }));
    fs.writeFileSync(path.join(__dirname, 'admin', 'published-posts.json'), JSON.stringify(data, null, 2));
}



// ========== API Routes ==========

// Get video information
app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: true, message: 'URL is required' });
        }

        console.log('Fetching video info for:', url);

        // Use spawn to avoid shell escaping issues with cookies path
        const args = [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '--extractor-retries', '3',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];
        if (fs.existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
        }
        args.push(url);

        const videoData = await new Promise((resolve, reject) => {
            const proc = spawn(YTDLP_PATH, args);
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', d => stdout += d.toString());
            proc.stderr.on('data', d => stderr += d.toString());
            proc.on('close', code => {
                if (stderr) console.error('yt-dlp stderr:', stderr);
                if (code !== 0) return reject(new Error(stderr || 'yt-dlp failed'));
                try { resolve(JSON.parse(stdout)); }
                catch (e) { reject(new Error('Failed to parse yt-dlp output')); }
            });
            proc.on('error', reject);
        });

        // Get all formats and build quality options
        const formats = (videoData.formats || [])
            .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
            .map(f => ({
                itag: f.format_id,
                quality: f.height,
                qualityLabel: f.format_note || `${f.height}p`,
                hasVideo: true,
                hasAudio: f.acodec && f.acodec !== 'none',
                container: f.ext || 'mp4',
                contentLength: f.filesize || f.filesize_approx,
                fps: f.fps,
                format_id: f.format_id
            }))
            // Deduplicate by height, keep best
            .filter((f, idx, arr) => arr.findIndex(x => x.quality === f.quality) === idx)
            .sort((a, b) => (b.quality || 0) - (a.quality || 0));

        console.log(`Found ${formats.length} formats`);

        res.json({
            success: true,
            title: videoData.title,
            author: videoData.uploader || videoData.channel,
            duration: videoData.duration,
            views: videoData.view_count,
            uploadDate: videoData.upload_date,
            thumbnail: videoData.thumbnail,
            description: videoData.description,
            formats: formats
        });

    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({
            error: true,
            message: error.message || 'Failed to fetch video information'
        });
    }
});

// Download video
app.post('/api/download', async (req, res) => {
    try {
        const { url, quality } = req.body;

        if (!url) {
            return res.status(400).json({ error: true, message: 'URL is required' });
        }

        console.log('Download request:', { url, quality });

        // Get video info first to get the title
        const infoCommand = `${IS_WINDOWS ? `"${YTDLP_PATH}"` : YTDLP_PATH} --get-title --no-warnings ${COOKIES_FLAG} --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
        const { stdout: titleOutput } = await execPromise(infoCommand);
        const title = titleOutput.trim().replace(/[^\w\s.-]/gi, '_');

        console.log('Video title:', title);

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Download and stream to response
        const maxHeight = quality ? quality.replace('p', '') : '720';
        const args = [
            ...(FFMPEG_PATH ? ['--ffmpeg-location', FFMPEG_PATH] : []),
            ...(fs.existsSync(COOKIES_PATH) ? ['--cookies', COOKIES_PATH] : []),
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-f', `bestvideo[height<=${maxHeight}][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=${maxHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]/best`,
            '--merge-output-format', 'mp4',
            '--remux-video', 'mp4',
            '-o', '-',
            '--no-warnings',
            url
        ];

        console.log('Spawning yt-dlp with args:', args);

        const ytdlp = spawn(YTDLP_PATH, args);

        // Pipe yt-dlp output directly to response
        ytdlp.stdout.pipe(res);

        ytdlp.stderr.on('data', (data) => {
            console.error('yt-dlp stderr:', data.toString());
        });

        ytdlp.on('error', (error) => {
            console.error('yt-dlp process error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: true,
                    message: 'Download process failed'
                });
            }
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.error('yt-dlp exited with code:', code);
            } else {
                console.log('Download completed successfully');
            }
        });

        res.on('error', (error) => {
            console.error('Response error:', error);
            ytdlp.kill();
        });

        req.on('close', () => {
            ytdlp.kill();
        });

    } catch (error) {
        console.error('Error downloading video:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: true,
                message: error.message || 'Failed to download video'
            });
        }

        
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Docs
app.get('/api/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-docs.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running with yt-dlp' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║                                           ║
    ║   🎥 YouTube Downloader Server Running   ║
    ║                                           ║
    ║   Server:  http://localhost:${PORT}        ║
    ║   Status:  ✓ Ready                        ║
    ║   Engine:  yt-dlp (bypasses restrictions)║
    ║                                           ║
    ╚═══════════════════════════════════════════╝
    `);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});
