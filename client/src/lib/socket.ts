// ─────────────────────────────────────────────
//  Socket.IO client singleton
// ─────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';

function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname;

    // Dynamically match the exact host the browser is visiting on port 3001.
    // localhost:3000 -> connects to localhost:3001
    // 172.20.10.8:3000 -> connects to 172.20.10.8:3001
    return `${protocol}//${hostname}:3001`;
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
