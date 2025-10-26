const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8081');

ws.on('open', () => {
  console.log('open');
  ws.send('hello from test client');
});

ws.on('message', (msg) => console.log('message:', msg.toString()));
ws.on('error', (err) => console.error('error:', err && err.message ? err.message : err));
ws.on('close', (code, reason) => console.log('closed', code, reason && reason.toString()));