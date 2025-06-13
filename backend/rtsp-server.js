const express = require('express');
const expressWs = require('express-ws');
const { proxy } = require('rtsp-relay')(express());
const { exec } = require('child_process');

const app = express();
expressWs(app);

// Increase max listeners limit
require('events').EventEmitter.defaultMaxListeners = 20;

const rtspUrl = process.env.RTSP_URL || 'rtsp://localhost:8554/mystream';
console.log('Using RTSP URL:', rtspUrl);

// Test RTSP connection
console.log('Testing RTSP connection...');
exec(`ffprobe -v error -show_entries stream=codec_type -of default=noprint_wrappers=1 ${rtspUrl}`, (error, stdout, stderr) => {
  if (error) {
    console.error('RTSP connection test failed:', error);
    console.error('Error details:', stderr);
    // Don't exit, just log the error and continue
  } else {
    console.log('RTSP connection test successful:', stdout);
  }
});

const handler = proxy({
  url: rtspUrl,
  verbose: true,
  transport: 'tcp',
  ffmpegOptions: {
    '-rtsp_transport': 'tcp',
    '-re': '',
    '-analyzeduration': '1000000',
    '-probesize': '1000000',
    '-flags': '+genpts',
    '-preset': 'medium',
    '-crf': '18',
    '-b:v': '3000k',
    '-maxrate': '3500k',
    '-bufsize': '6000k',
    '-profile:v': 'high',
    '-level': '4.1',
    '-pix_fmt': 'yuv420p',
  },
});

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Keep track of active connections
const activeConnections = new Set();

app.ws('/api/stream', (ws, req) => {
  console.log('🟢 New client connected from:', req.socket.remoteAddress);
  activeConnections.add(ws);

  // Send keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => {
    console.log('🔴 Client disconnected');
    activeConnections.delete(ws);
    clearInterval(pingInterval);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    activeConnections.delete(ws);
    clearInterval(pingInterval);
  });

  ws.on('pong', () => {
    console.log('Received pong from client');
  });

  try {
    handler(ws, req);
  } catch (error) {
    console.error('Error in handler:', error);
    ws.close();
  }
});

// Add a basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    rtspUrl: rtspUrl
  });
});

const server = app.listen(2000, '0.0.0.0', () => {
  console.log('✅ RTSP relay server running on ws://0.0.0.0:2000/api/stream');
  console.log('Server IP:', require('os').networkInterfaces());
});

// Handle server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing all connections...');
  activeConnections.forEach(ws => {
    try {
      ws.close();
    } catch (e) {
      console.error('Error closing connection:', e);
    }
  });
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.on('error', (error) => {
  console.error('Server error:', error);
});