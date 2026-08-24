// ─────────────────────────────────────────────
//  Socket.IO client singleton
//
//  Connection strategy:
//  - NEXT_PUBLIC_SERVER_URL in .env.local sets
//    the Socket.IO server address explicitly.
//  - Set this to http://YOUR_LAN_IP:3001
//  - Phones connect directly to port 3001.
//  - Make sure to run open-firewall.bat first!
// ─────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';

function getServerUrl(): string {
  // Use the explicit server URL from environment (set in .env.local)
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  if (envUrl) return envUrl;
  // Fallback to same host on port 3001
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.port = '3001';
    return url.origin;
  }
  return 'http://localhost:3001';
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = getServerUrl();
    socket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['polling', 'websocket'],
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
