FROM node:18-slim

# Install Python, pip, ffmpeg, curl
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp as a binary directly (most reliable)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy all project files
COPY . .

# Verify cookies.txt exists
RUN ls -la /app/cookies.txt && echo "cookies.txt found" || echo "WARNING: cookies.txt missing"

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server-ytdlp.js"]
