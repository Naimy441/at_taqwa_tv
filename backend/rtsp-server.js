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

// Track single active connection
let activeConnection = null;

app.ws('/api/stream', (ws, req) => {
  // If there's already an active connection, reject the new one
  if (activeConnection) {
    console.log('Rejecting new connection - only one connection allowed');
    ws.close(1000, 'Only one connection allowed');
    return;
  }

  // Set as active connection
  activeConnection = ws;
  console.log('New connection established');

  // Handle connection close
  ws.on('close', () => {
    console.log('Client disconnected');
    activeConnection = null;
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    activeConnection = null;
  });

  // Use the proxy handler
  handler(ws, req);
});

// Cleanup function for graceful shutdown
function cleanup() {
  console.log('Cleaning up connection...');
  if (activeConnection && activeConnection.readyState === activeConnection.OPEN) {
    activeConnection.close();
  }
  activeConnection = null;
}

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

const server = app.listen(2000, () => {
  console.log('RTSP relay server running on ws://localhost:2000/api/stream');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  cleanup();
}); 