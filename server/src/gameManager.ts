// ─────────────────────────────────────────────
//  Game Manager — state machine & playback control
// ─────────────────────────────────────────────

import { Room, GameState, PlayerRole, PlaybackState } from './types';

const PLAY_BUFFER_MS = 600; // future timestamp buffer for synchronized start
const SYNC_INTERVAL_MS = 5000;

export function canTransition(from: GameState, to: GameState): boolean {
  const transitions: Record<GameState, GameState[]> = {
    WAITING: ['LOBBY'],
    LOBBY: ['ROLE_ASSIGNMENT', 'WAITING'],
    ROLE_ASSIGNMENT: ['READY_CHECK', 'LOBBY'],
    READY_CHECK: ['PLAYING', 'ROLE_ASSIGNMENT'],
    PLAYING: ['PAUSED', 'ROUND_COMPLETE'],
    PAUSED: ['PLAYING', 'ROUND_COMPLETE'],
    ROUND_COMPLETE: ['NEXT_ROUND', 'GAME_OVER'],
    NEXT_ROUND: ['ROLE_ASSIGNMENT', 'LOBBY'],
    GAME_OVER: ['LOBBY'],
  };
  return transitions[from]?.includes(to) ?? false;
}

/** Build a play command payload with synchronized future start time */
export function buildPlayCommand(
  room: Room,
  role: PlayerRole,
  startPosition: number = 0
): {
  videoId: string;
  serverTime: number;
  startAt: number;
  startPosition: number;
} {
  const song = role === 'CREW' ? room.crewSong : room.imposterSong;
  if (!song) throw new Error('SONG_NOT_LOADED');

  const serverTime = Date.now();
  const startAt = serverTime + PLAY_BUFFER_MS;

  // Update playback state
  const playback = role === 'CREW' ? room.crewPlayback : room.imposterPlayback;
  playback.isPlaying = true;
  playback.startedAt = serverTime;
  playback.scheduledStartAt = startAt;
  playback.pausedAt = undefined;
  playback.seekPosition = startPosition;

  return { videoId: song.videoId, serverTime, startAt, startPosition };
}

/** Calculate current expected position for sync */
export function getExpectedPosition(playback: PlaybackState): number {
  if (!playback.isPlaying) return playback.pausePosition;
  const elapsed = (Date.now() - playback.scheduledStartAt) / 1000;
  return Math.max(0, playback.seekPosition + elapsed);
}

/** Mark playback as paused */
export function pausePlayback(playback: PlaybackState, currentPosition: number): void {
  playback.isPlaying = false;
  playback.pausedAt = Date.now();
  playback.pausePosition = currentPosition;
}

/** Mark playback as stopped */
export function stopPlayback(playback: PlaybackState): void {
  playback.isPlaying = false;
  playback.pausedAt = undefined;
  playback.pausePosition = 0;
  playback.seekPosition = 0;
  playback.startedAt = 0;
  playback.scheduledStartAt = 0;
}

/** All players ready check */
export function allPlayersReady(room: Room): boolean {
  const players = [...room.players.values()].filter((p) => p.isConnected);
  if (players.length === 0) return false;
  return players.every((p) => p.isReady);
}

/** Count connected players */
export function connectedCount(room: Room): number {
  return [...room.players.values()].filter((p) => p.isConnected).length;
}

/** Get list of player IDs by role */
export function getPlayersByRole(room: Room, role: PlayerRole): string[] {
  return [...room.players.values()]
    .filter((p) => p.role === role)
    .map((p) => p.id);
}

/** Get the imposter(s) */
export function getImposters(room: Room) {
  return [...room.players.values()].filter((p) => p.role === 'IMPOSTER');
}
