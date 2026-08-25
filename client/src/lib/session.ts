// ─────────────────────────────────────────────
//  Session ID management (localStorage)
// ─────────────────────────────────────────────

const SESSION_KEY = 'fti_session_id';
const ROOM_KEY = 'fti_room_code';
const NAME_KEY = 'fti_player_name';
const HOST_KEY = 'fti_is_host';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if crypto.randomUUID fails in insecure context
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function saveRoomSession(roomCode: string, playerName: string, isHost: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROOM_KEY, roomCode);
  localStorage.setItem(NAME_KEY, playerName);
  localStorage.setItem(HOST_KEY, isHost ? '1' : '0');
}

export function getRoomSession(): { roomCode: string; playerName: string; isHost: boolean } | null {
  if (typeof window === 'undefined') return null;
  const roomCode = localStorage.getItem(ROOM_KEY);
  const playerName = localStorage.getItem(NAME_KEY);
  const isHost = localStorage.getItem(HOST_KEY) === '1';
  if (!roomCode || !playerName) return null;
  return { roomCode, playerName, isHost };
}

export function clearRoomSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ROOM_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(HOST_KEY);
}
