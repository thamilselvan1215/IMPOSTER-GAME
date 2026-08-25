// ─────────────────────────────────────────────
//  Server Entry Point
// ─────────────────────────────────────────────

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerSocketHandlers } from './socketHandler';
import { startRoomCleanup } from './roomManager';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// Server time endpoint (for client clock sync)
app.get('/time', (_req, res) => {
  res.json({ serverTime: Date.now() });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 120000,       // 2 min: time to wait for pong before disconnecting
  pingInterval: 30000,       // 30s: how often to ping clients
  connectTimeout: 30000,     // 30s: max time to complete handshake
  maxHttpBufferSize: 1e6,    // 1MB max message size
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  upgradeTimeout: 10000,
});


registerSocketHandlers(io);
startRoomCleanup();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🎵  Find the Imposter — Server     ║');
  console.log(`║   Running on port ${PORT}               ║`);
  console.log('║   Players connect via your LAN IP    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Print local IP addresses for convenience
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  📡 Local IP: http://${net.address}:${PORT}`);
        console.log(`  📱 Players open: http://${net.address}:3000`);
      }
    }
  }
  console.log('');
});
