const express = require('express');
const expressWs = require('express-ws');
const { proxy } = require('rtsp-relay')(express());

const app = express();
expressWs(app);

// Increase max listeners limit
require('events').EventEmitter.defaultMaxListeners = 20;

const handler = proxy({
  url: process.env.RTSP_URL || 'rtsp://localhost:8554/mystream',
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

app.ws('/api/stream', (ws, req) => {
  console.log('🟢 New client connected');

  ws.on('close', () => {
    console.log('🔴 Client disconnected');
    // Optional: call cleanup on handler if supported
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  handler(ws, req);
});

const server = app.listen(2000, () => {
  console.log('✅ RTSP relay server running on ws://localhost:2000/api/stream');
});

server.on('error', (error) => {
  console.error('Server error:', error);
});