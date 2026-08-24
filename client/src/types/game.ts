// ─────────────────────────────────────────────
//  Shared TypeScript types (client-side)
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

export interface PublicPlayer {
  id: string;
  name: string;
  isReady: boolean;
  isConnected: boolean;
  role?: PlayerRole; // only populated on host view
}

export interface RoomState {
  code: string;
  hostName: string;
  state: GameState;
  round: number;
  players: PublicPlayer[];
  connected: number;
  total: number;
  crewSongLoaded: boolean;
  imposterSongLoaded: boolean;
  crewVideoId?: string;
  imposterVideoId?: string;
}

export interface PlayCommand {
  videoId: string;
  serverTime: number;
  startAt: number;
  startPosition: number;
}

export interface SyncCheck {
  expectedPosition: number;
  serverTime: number;
  role: PlayerRole;
}

export interface RoleAssignmentEntry {
  playerId: string;
  playerName: string;
  role: PlayerRole;
}
