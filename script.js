// ========== Global Variables ==========
let currentVideoData = null;
let selectedFormat = 'video';
let selectedQuality = null;

// ========== DOM Elements ==========
const elements = {
    videoUrl: document.getElementById('videoUrl'),
    clearBtn: document.getElementById('clearBtn'),
    fetchBtn: document.getElementById('fetchBtn'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    videoInfoSection: document.getElementById('videoInfoSection'),
    videoThumbnail: document.getElementById('videoThumbnail'),
    videoTitle: document.getElementById('videoTitle'),
    videoAuthor: document.getElementById('videoAuthor'),
    videoViews: document.getElementById('videoViews'),
    videoDate: document.getElementById('videoDate'),
    videoDuration: document.getElementById('videoDuration'),
    qualityGrid: document.getElementById('qualityGrid'),
    downloadProgress: document.getElementById('downloadProgress'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    formatTabs: document.querySelectorAll('.tab-btn')
};

// ========== API Configuration ==========
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

// ========== Event Listeners ==========
elements.videoUrl.addEventListener('input', handleUrlInput);
elements.clearBtn.addEventListener('click', clearInput);
elements.fetchBtn.addEventListener('click', fetchVideoInfo);
elements.videoUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchVideoInfo();
});

elements.formatTabs.forEach(tab => {
    tab.addEventListener('click', () => switchFormat(tab.dataset.format));
});

// ========== Utility Functions ==========
function handleUrlInput() {
    const hasValue = elements.videoUrl.value.trim().length > 0;
    elements.clearBtn.classList.toggle('visible', hasValue);
}

function clearInput() {
    elements.videoUrl.value = '';
    elements.clearBtn.classList.remove('visible');
    elements.videoUrl.focus();
}

function showError(message) {
    elements.errorText.textContent = message;
    elements.errorMessage.classList.add('active');
    setTimeout(() => {
        elements.errorMessage.classList.remove('active');
    }, 5000);
}

function hideError() {
    elements.errorMessage.classList.remove('active');
}

function showLoading(show) {
    elements.loadingSpinner.classList.toggle('active', show);
    elements.fetchBtn.disabled = show;
}

function validateYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
}

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

// ========== Fetch Video Info ==========
async function fetchVideoInfo() {
    const url = elements.videoUrl.value.trim();

    // Validation
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    if (!validateYouTubeUrl(url)) {
        showError('Please enter a valid YouTube URL');
        return;
    }

    hideError();
    showLoading(true);
    elements.videoInfoSection.classList.remove('active');

    try {
        const response = await fetch(`${API_BASE_URL}/video-info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch video information');
        }

        const data = await response.json();
        currentVideoData = data;
        displayVideoInfo(data);

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to fetch video information. Please try again.');
    } finally {
        showLoading(false);
    }
}

// ========== Display Video Info ==========
function displayVideoInfo(data) {
    // Set video details
    elements.videoThumbnail.src = data.thumbnail;
    elements.videoTitle.textContent = data.title;
    elements.videoAuthor.textContent = data.author;
    elements.videoViews.textContent = formatNumber(data.views) + ' views';
    elements.videoDate.textContent = formatDate(data.uploadDate);
    elements.videoDuration.textContent = formatDuration(data.duration);

    // Display quality options
    displayQualityOptions(data.formats);

    // Show video info section
    elements.videoInfoSection.classList.add('active');

    // Smooth scroll to video info
    setTimeout(() => {
        elements.videoInfoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// ========== Display Quality Options ==========
function displayQualityOptions(formats) {
    elements.qualityGrid.innerHTML = '';

    const filteredFormats = selectedFormat === 'video'
        ? formats.filter(f => f.hasVideo && f.qualityLabel && f.qualityLabel !== 'tiny')
        : formats.filter(f => f.hasAudio);

    // Group and sort formats
    const uniqueQualities = [...new Set(filteredFormats.map(f => f.qualityLabel || f.quality))];
    const sortedQualities = uniqueQualities.sort((a, b) => {
        const getRes = (q) => {
            const match = q.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        };
        return getRes(b) - getRes(a);
    });

    sortedQualities.forEach(quality => {
        const format = filteredFormats.find(f => (f.qualityLabel || f.quality) === quality);
        if (!format) return;

        const card = document.createElement('div');
        card.className = 'quality-card';
        card.dataset.itag = format.itag;

        const label = selectedFormat === 'video'
            ? (format.qualityLabel || format.quality)
            : `${format.audioBitrate || 'Best'} kbps`;

        const info = selectedFormat === 'video'
            ? `${format.container || 'mp4'} • ${format.fps || 30}fps`
            : format.container || 'mp3';

        // All downloads include audio (merged by yt-dlp+ffmpeg)
        const downloadText = '📥 Click to Download (with audio)';

        card.innerHTML = `
            <div class="quality-label">${label}</div>
            <div class="quality-info">${info}</div>
            <div class="quality-size">${formatFileSize(format.contentLength)}</div>
            <div class="download-hint" style="font-size: 11px; color: #10b981; margin-top: 8px;">${downloadText}</div>
        `;

        card.addEventListener('click', () => selectQuality(card, format));
        elements.qualityGrid.appendChild(card);
    });

    if (filteredFormats.length === 0) {
        elements.qualityGrid.innerHTML = '<p style="color: #ef4444; text-align: center;">No formats available</p>';
    }
}

// ========== Switch Format ==========
function switchFormat(format) {
    selectedFormat = format;
    selectedQuality = null;

    // Update active tab
    elements.formatTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.format === format);
    });

    // Update quality options
    if (currentVideoData) {
        displayQualityOptions(currentVideoData.formats);
    }
}

// ========== Select Quality ==========
function selectQuality(card, format) {
    // Remove previous selection
    document.querySelectorAll('.quality-card').forEach(c => {
        c.classList.remove('selected');
    });

    // Add selection
    card.classList.add('selected');
    selectedQuality = format;

    // Start download
    downloadVideo(format);
}

// ========== Download Video ==========
async function downloadVideo(format) {
    elements.downloadProgress.classList.add('active');
    elements.progressFill.style.width = '0%';
    elements.progressPercent.textContent = '0%';
    elements.progressText.textContent = 'Preparing download...';

    try {
        console.log('Starting download with format:', format);

        // Always use server-side download (direct URLs have CORS issues)
        const response = await fetch(`${API_BASE_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: elements.videoUrl.value.trim(),
                quality: format.qualityLabel || format.quality
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Download failed');
        }

        elements.progressText.textContent = 'Downloading...';
        elements.progressFill.style.width = '50%';
        elements.progressPercent.textContent = '50%';

        // Get the blob
        const blob = await response.blob();

        elements.progressFill.style.width = '90%';
        elements.progressPercent.textContent = '90%';

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        // Set filename
        const extension = selectedFormat === 'video' ? 'mp4' : 'mp3';
        const filename = `${currentVideoData.title.substring(0, 50)}.${extension}`;
        a.download = filename.replace(/[^\w\s.-]/gi, '_');

        // Trigger download
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Update progress
        elements.progressFill.style.width = '100%';
        elements.progressPercent.textContent = '100%';
        elements.progressText.textContent = 'Download complete!';

        // Hide progress after 3 seconds
        setTimeout(() => {
            elements.downloadProgress.classList.remove('active');
        }, 3000);

    } catch (error) {
        console.error('Download error:', error);
        showError(error.message || 'Download failed. Please try again.');
        elements.downloadProgress.classList.remove('active');
    }
}

// ========== Progress Simulation (for visual feedback) ==========
function simulateProgress() {
    let progress = 0;
    const interval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 10;
            progress = Math.min(progress, 90);
            elements.progressFill.style.width = progress + '%';
            elements.progressPercent.textContent = Math.round(progress) + '%';

            if (progress < 30) {
                elements.progressText.textContent = 'Preparing download...';
            } else if (progress < 60) {
                elements.progressText.textContent = 'Downloading...';
            } else {
                elements.progressText.textContent = 'Almost done...';
            }
        } else {
            clearInterval(interval);
        }
    }, 500);

    return interval;
}

// ========== Initialize ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('YouTube Downloader initialized');
});
