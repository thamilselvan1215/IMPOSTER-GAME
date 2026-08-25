// ─────────────────────────────────────────────
//  Socket.IO client singleton
// ─────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';

function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol;

    // If running locally or on local LAN IP (e.g. 192.168.x.x, 172.x.x.x, localhost)
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\./.test(host) ||
      /^172\./.test(host) ||
      /^10\./.test(host)
    ) {
      return `${protocol}//${host}:3001`;
    }

    // Cloud deployment (Vercel): use NEXT_PUBLIC_SERVER_URL or fall back to live Render backend
    const envUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    if (envUrl) return envUrl;

    return 'https://imposter-game-servers.onrender.com';
  }
  return process.env.NEXT_PUBLIC_SERVER_URL || 'https://imposter-game-servers.onrender.com';
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
      timeout: 10000,
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
