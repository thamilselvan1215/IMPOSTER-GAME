// ─────────────────────────────────────────────
//  Shared TypeScript types for the server
// ─────────────────────────────────────────────

export type GameState =
  | 'WAITING'
  | 'LOBBY'
  | 'ROLE_ASSIGNMENT'
  | 'READY_CHECK'
  | 'PLAYING'
  | 'PAUSED'
  | 'ROUND_COMPLETE'
  | 'NEXT_ROUND'
  | 'GAME_OVER';

export type PlayerRole = 'CREW' | 'IMPOSTER';

export interface Player {
  id: string;           // stable session ID (stored in client localStorage)
  socketId: string;     // current socket connection ID
  name: string;
  role?: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
}

export interface SongConfig {
  videoId: string;
  loadedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  startedAt: number;       // server epoch ms when play was commanded
  scheduledStartAt: number; // future epoch ms when clients should actually start
  pausedAt?: number;       // epoch ms when paused
  pausePosition: number;   // video position (seconds) when paused
  seekPosition: number;    // last seeked position
}

export interface Room {
  code: string;
  hostId: string;          // stable host session ID
  hostSocketId: string;    // current host socket connection ID
  hostName: string;
  players: Map<string, Player>; // keyed by player session ID
  crewSong?: SongConfig;
  imposterSong?: SongConfig;
  crewPlayback: PlaybackState;
  imposterPlayback: PlaybackState;
  state: GameState;
  round: number;
  lastImposterIds: string[];   // history to avoid repeat imposters
  hostDisconnectedAt?: number;
  createdAt: number;
  maxPlayers: number;
}

export interface RoomPublicState {
  code: string;
  hostName: string;
  state: GameState;
  round: number;
  playerCount: number;
  maxPlayers: number;
}

// ── Abstract store interface (swap in PostgreSQL later) ──────────────────────
export interface RoomStore {
  createRoom(room: Room): Promise<void>;
  getRoom(code: string): Promise<Room | undefined>;
  updateRoom(code: string, updates: Partial<Room>): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  getAllRooms(): Promise<Room[]>;
}
