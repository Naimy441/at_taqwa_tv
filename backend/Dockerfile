FROM node:20-alpine

# Install FFmpeg and wget
RUN apk add --no-cache ffmpeg wget

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy the backend files
COPY backend/ ./

# Expose the WebSocket port
EXPOSE 2000

# Start the RTSP relay server
CMD ["npm", "start"] 