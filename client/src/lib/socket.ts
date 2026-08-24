// ─────────────────────────────────────────────
//  Socket.IO client singleton
// ─────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';

function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    // If on a device connecting via LAN IP (e.g. 192.168.x.x), dynamically use that IP on port 3001
    const host = window.location.hostname;
    const protocol = window.location.protocol;

    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `${protocol}//${host}:3001`;
    }

    const envUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    if (envUrl) return envUrl;

    return `${protocol}//${host}:3001`;
  }
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
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
