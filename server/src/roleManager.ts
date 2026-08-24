// ─────────────────────────────────────────────
//  Role Manager — server-authoritative role assignment
// ─────────────────────────────────────────────

import { Player, PlayerRole } from './types';

export interface RoleAssignment {
  playerId: string;
  role: PlayerRole;
}

/**
 * Cryptographically random Fisher-Yates shuffle
 */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    // Use Math.random — good enough for a party game
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomly assign roles to all players.
 * Exactly `imposterCount` imposters, rest are crew.
 * Tries to avoid re-using the same imposter from `lastImposterIds`.
 */
export function randomizeRoles(
  players: Player[],
  imposterCount: number,
  lastImposterIds: string[]
): RoleAssignment[] {
  if (players.length === 0) return [];

  // Clamp imposter count
  const count = Math.min(Math.max(1, imposterCount), Math.floor(players.length / 2));

  // Prefer players who haven't been imposter recently
  const neverImposter = players.filter((p) => !lastImposterIds.includes(p.id));
  const prevImposter = players.filter((p) => lastImposterIds.includes(p.id));

  // Build imposter pool: prefer fresh players
  let pool = [...neverImposter];
  if (pool.length < count) {
    pool = [...pool, ...prevImposter];
  }

  const shuffled = shuffleArray(pool);
  const imposters = new Set(shuffled.slice(0, count).map((p) => p.id));

  return players.map((p) => ({
    playerId: p.id,
    role: imposters.has(p.id) ? 'IMPOSTER' : 'CREW',
  }));
}

/**
 * Manually assign a role to a specific player.
 * Returns updated full assignments list.
 */
export function assignRole(
  assignments: RoleAssignment[],
  playerId: string,
  role: PlayerRole
): RoleAssignment[] {
  return assignments.map((a) =>
    a.playerId === playerId ? { ...a, role } : a
  );
}

/**
 * Rotate imposters: current imposters become crew, crew become imposters.
 * Not used by default — "Random new imposter" is the standard path.
 */
export function swapRoles(assignments: RoleAssignment[]): RoleAssignment[] {
  return assignments.map((a) => ({
    ...a,
    role: a.role === 'IMPOSTER' ? 'CREW' : 'IMPOSTER',
  }));
}

/**
 * Pick a new random imposter from crew, avoiding previous imposters.
 */
export function pickNextImposter(
  players: Player[],
  lastImposterIds: string[]
): RoleAssignment[] {
  const crew = players.filter((p) => !lastImposterIds.includes(p.id));
  const pool = crew.length > 0 ? crew : players; // fallback if everyone was imposter
  const shuffled = shuffleArray(pool);
  const newImposter = shuffled[0];

  return players.map((p) => ({
    playerId: p.id,
    role: p.id === newImposter.id ? 'IMPOSTER' : 'CREW',
  }));
}

/**
 * Validate that there is exactly one imposter (or within expected bounds).
 */
export function validateAssignments(
  assignments: RoleAssignment[],
  expectedImposterCount = 1
): { valid: boolean; error?: string } {
  const imposterCount = assignments.filter((a) => a.role === 'IMPOSTER').length;
  if (imposterCount === 0) return { valid: false, error: 'NO_IMPOSTER' };
  if (imposterCount !== expectedImposterCount) {
    return { valid: false, error: `WRONG_IMPOSTER_COUNT:${imposterCount}` };
  }
  return { valid: true };
}
