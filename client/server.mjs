/**
 * Unified Custom Server
 * ---------------------
 * Runs Next.js + Socket.IO on the SAME port (3000).
 * Phones only need one address: http://YOUR_LAN_IP:3000
 * No proxy, no firewall issues for port 3001.
 *
 * Usage: node server.mjs   (runs in production)
 *        Used by: npm run dev:unified
 */

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { parse } from 'url';
import next from 'next';
import { networkInterfaces } from 'os';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Next.js app ───────────────────────────────────────────────────────────
const app = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

await app.prepare();

// ── HTTP Server ───────────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

// ── Socket.IO ────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  // Allow both transports — polling works from phones without firewall issues
  transports: ['polling', 'websocket'],
});

// Import and register socket handlers (same logic as server/src/socketHandler.ts)
// We inline a simplified import here via dynamic require
const { registerSocketHandlers } = await import('./socket-server/socketHandler.js');
const { startRoomCleanup } = await import('./socket-server/roomManager.js');

registerSocketHandlers(io);
startRoomCleanup();

// ── Start ─────────────────────────────────────────────────────────────────
httpServer.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║  🎵  Find the Imposter — Unified     ║');
  console.log(`║  Next.js + Socket.IO on port ${port}  ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  🖥  Local: http://localhost:${port}`);

  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  📡 Network: http://${net.address}:${port}`);
        console.log(`  📱 Players: http://${net.address}:${port}/join`);
      }
    }
  }
  console.log('');
});
