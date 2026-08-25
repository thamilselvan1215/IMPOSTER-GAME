// ─────────────────────────────────────────────
//  In-Memory Room Manager
//  Implements RoomStore interface for easy DB swap later
// ─────────────────────────────────────────────

import { Room, RoomStore, Player, PlaybackState } from './types';

const AMBIGUOUS_CHARS = /[O0I1]/g;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_ROOMS = 100;
const ROOM_IDLE_TTL_MS = 10 * 60 * 1000;  // 10 minutes idle TTL
const HOST_DISCONNECT_GRACE_MS = 5 * 60 * 1000; // 5 min grace period for host reconnect


function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function defaultPlayback(): PlaybackState {
  return {
    isPlaying: false,
    startedAt: 0,
    scheduledStartAt: 0,
    pausePosition: 0,
    seekPosition: 0,
  };
}

class InMemoryRoomStore implements RoomStore {
  private rooms: Map<string, Room> = new Map();

  async createRoom(room: Room): Promise<void> {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error('SERVER_FULL');
    }
    this.rooms.set(room.code, room);
  }

  async getRoom(code: string): Promise<Room | undefined> {
    return this.rooms.get(code.toUpperCase());
  }

  async updateRoom(code: string, updates: Partial<Room>): Promise<void> {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    Object.assign(room, updates);
  }

  async deleteRoom(code: string): Promise<void> {
    this.rooms.delete(code.toUpperCase());
  }

  async getAllRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }
}

export const roomStore: RoomStore = new InMemoryRoomStore();

// ── Public API ───────────────────────────────────────────────────────────────

export async function createRoom(
  hostId: string,
  hostSocketId: string,
  hostName: string
): Promise<Room> {
  let code = generateRoomCode();
  let attempts = 0;
  while ((await roomStore.getRoom(code)) && attempts < 20) {
    code = generateRoomCode();
    attempts++;
  }

  const room: Room = {
    code,
    hostId,
    hostSocketId,
    hostName,
    players: new Map(),
    state: 'LOBBY',
    round: 1,
    lastImposterIds: [],
    crewPlayback: defaultPlayback(),
    imposterPlayback: defaultPlayback(),
    createdAt: Date.now(),
    maxPlayers: 15,
  };

  await roomStore.createRoom(room);
  return room;
}

export async function getRoom(code: string): Promise<Room | undefined> {
  return roomStore.getRoom(code);
}

export async function addPlayer(
  roomCode: string,
  player: Player
): Promise<Room> {
  const room = await roomStore.getRoom(roomCode);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  if (room.players.size >= room.maxPlayers) throw new Error('ROOM_FULL');

  // Check for duplicate name (excluding reconnection by same ID)
  for (const [pid, p] of room.players) {
    if (p.name.toLowerCase() === player.name.toLowerCase() && pid !== player.id) {
      throw new Error('DUPLICATE_NAME');
    }
  }

  room.players.set(player.id, player);
  return room;
}

export async function removePlayer(
  roomCode: string,
  playerId: string
): Promise<Room | undefined> {
  const room = await roomStore.getRoom(roomCode);
  if (!room) return undefined;
  room.players.delete(playerId);
  return room;
}

export async function getPlayer(
  roomCode: string,
  playerId: string
): Promise<Player | undefined> {
  const room = await roomStore.getRoom(roomCode);
  return room?.players.get(playerId);
}

export async function updatePlayer(
  roomCode: string,
  playerId: string,
  updates: Partial<Player>
): Promise<void> {
  const room = await roomStore.getRoom(roomCode);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;
  Object.assign(player, updates);
}

export async function deleteRoom(code: string): Promise<void> {
  return roomStore.deleteRoom(code);
}

// ── Cleanup stale rooms ──────────────────────────────────────────────────────
export function startRoomCleanup(): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Date.now();
    const allRooms = await roomStore.getAllRooms();
    for (const room of allRooms) {
      const allDisconnected = [...room.players.values()].every(
        (p) => !p.isConnected
      );
      const hostGone =
        room.hostDisconnectedAt !== undefined &&
        now - room.hostDisconnectedAt > HOST_DISCONNECT_GRACE_MS + ROOM_IDLE_TTL_MS;
      const stale = allDisconnected && now - room.createdAt > ROOM_IDLE_TTL_MS;

      if (hostGone || stale) {
        await roomStore.deleteRoom(room.code);
        console.log(`[RoomManager] Cleaned up stale room: ${room.code}`);
      }
    }
  }, 30_000);
}
