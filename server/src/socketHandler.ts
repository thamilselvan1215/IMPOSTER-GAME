// ─────────────────────────────────────────────
//  Socket.IO Event Handler — all game events
// ─────────────────────────────────────────────

import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  updatePlayer,
  deleteRoom,
} from './roomManager';
import {
  randomizeRoles,
  assignRole,
  pickNextImposter,
  validateAssignments,
} from './roleManager';
import {
  buildPlayCommand,
  getExpectedPosition,
  pausePlayback,
  stopPlayback,
  allPlayersReady,
  connectedCount,
  getImposters,
  canTransition,
} from './gameManager';
import { Player, PlayerRole, Room } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  try {
    // youtu.be/ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // youtube.com/watch?v=ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    // youtube.com/embed/ID
    const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
    // Maybe it's already just an ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    return null;
  } catch {
    return null;
  }
}

function emit(io: Server, socketId: string, event: string, data: unknown) {
  io.to(socketId).emit(event, data);
}

function buildPublicRoomState(room: Room) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isReady: p.isReady,
    isConnected: p.isConnected,
  }));
  return {
    code: room.code,
    hostName: room.hostName,
    state: room.state,
    round: room.round,
    players,
    connected: connectedCount(room),
    total: room.players.size,
    crewSongLoaded: !!room.crewSong,
    imposterSongLoaded: !!room.imposterSong,
    crewVideoId: room.crewSong?.videoId,
    imposterVideoId: room.imposterSong?.videoId,
  };
}

function buildHostRoomState(room: Room) {
  const base = buildPublicRoomState(room);
  const playersWithRoles = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isReady: p.isReady,
    isConnected: p.isConnected,
    role: p.role,
  }));
  return { ...base, players: playersWithRoles };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server) {
  // Map: sessionId → socketId (for reconnection)
  const sessionMap = new Map<string, string>();
  // Map: socketId → { sessionId, roomCode, isHost }
  const connectionMap = new Map<
    string,
    { sessionId: string; roomCode: string; isHost: boolean }
  >();

  // Periodic sync interval per room
  const syncIntervals = new Map<string, NodeJS.Timeout>();

  function startSyncInterval(io: Server, roomCode: string) {
    if (syncIntervals.has(roomCode)) return;
    const interval = setInterval(async () => {
      const room = await getRoom(roomCode);
      if (!room) {
        clearInterval(interval);
        syncIntervals.delete(roomCode);
        return;
      }
      if (room.state !== 'PLAYING') return;

      // Sync crew
      if (room.crewSong && room.crewPlayback.isPlaying) {
        const expectedPosition = getExpectedPosition(room.crewPlayback);
        const serverTime = Date.now();
        [...room.players.values()]
          .filter((p) => p.role === 'CREW' && p.isConnected)
          .forEach((p) => {
            io.to(p.socketId).emit('sync_check', { expectedPosition, serverTime, role: 'CREW' });
          });
      }

      // Sync imposter
      if (room.imposterSong && room.imposterPlayback.isPlaying) {
        const expectedPosition = getExpectedPosition(room.imposterPlayback);
        const serverTime = Date.now();
        [...room.players.values()]
          .filter((p) => p.role === 'IMPOSTER' && p.isConnected)
          .forEach((p) => {
            io.to(p.socketId).emit('sync_check', {
              expectedPosition,
              serverTime,
              role: 'IMPOSTER',
            });
          });
      }
    }, 5000);
    syncIntervals.set(roomCode, interval);
  }

  function stopSyncInterval(roomCode: string) {
    const interval = syncIntervals.get(roomCode);
    if (interval) {
      clearInterval(interval);
      syncIntervals.delete(roomCode);
    }
  }

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── CREATE ROOM ──────────────────────────────────────────────────────────
    socket.on(
      'create_room',
      async (data: { hostName: string; sessionId?: string }, callback?: any) => {
        try {
          const sessionId = data.sessionId || uuidv4();
          const room = await createRoom(sessionId, socket.id, data.hostName || 'Host');
          sessionMap.set(sessionId, socket.id);
          connectionMap.set(socket.id, { sessionId, roomCode: room.code, isHost: true });
          socket.join(`room:${room.code}`);
          socket.join(`room:${room.code}:host`);

          callback({ success: true, roomCode: room.code, sessionId });
          console.log(`[Room] Created: ${room.code} by ${data.hostName}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'UNKNOWN';
          callback({ success: false, error: msg });
        }
      }
    );

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    socket.on(
      'join_room',
      async (
        data: { roomCode: string; playerName: string; sessionId?: string },
        callback?: any
      ) => {
        try {
          const code = (data.roomCode || '').trim().toUpperCase();
          const room = await getRoom(code);
          if (!room) return callback({ success: false, error: 'ROOM_NOT_FOUND' });
          if (room.state === 'GAME_OVER')
            return callback({ success: false, error: 'GAME_OVER' });

          const sessionId = data.sessionId || uuidv4();

          // Check if this is a reconnecting player
          const existingPlayer = room.players.get(sessionId);
          if (existingPlayer) {
            // Reconnection
            existingPlayer.socketId = socket.id;
            existingPlayer.isConnected = true;
            sessionMap.set(sessionId, socket.id);
            connectionMap.set(socket.id, { sessionId, roomCode: room.code, isHost: false });
            socket.join(`room:${room.code}`);
            socket.join(`room:${room.code}:players`);

            // Send player their personal state
            const expectedPosition =
              existingPlayer.role === 'CREW'
                ? getExpectedPosition(room.crewPlayback)
                : getExpectedPosition(room.imposterPlayback);

            callback({ success: true, sessionId, reconnected: true });
            socket.emit('reconnected', {
              playerName: existingPlayer.name,
              role: existingPlayer.role,
              state: room.state,
              round: room.round,
              videoId:
                existingPlayer.role === 'CREW'
                  ? room.crewSong?.videoId
                  : room.imposterSong?.videoId,
              expectedPosition,
              isPlaying:
                existingPlayer.role === 'CREW'
                  ? room.crewPlayback.isPlaying
                  : room.imposterPlayback.isPlaying,
            });

            // Notify host
            io.to(`room:${room.code}:host`).emit('player_reconnected', {
              playerId: sessionId,
              playerName: existingPlayer.name,
            });
            io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
            console.log(`[Room] ${existingPlayer.name} reconnected to ${room.code}`);
            return;
          }

          // New player
          if (room.state !== 'LOBBY' && room.state !== 'WAITING') {
            return callback({ success: false, error: 'GAME_IN_PROGRESS' });
          }

          const player: Player = {
            id: sessionId,
            socketId: socket.id,
            name: data.playerName?.trim() || 'Player',
            isReady: false,
            isConnected: true,
            joinedAt: Date.now(),
          };

          await addPlayer(room.code, player);
          sessionMap.set(sessionId, socket.id);
          connectionMap.set(socket.id, { sessionId, roomCode: room.code, isHost: false });
          socket.join(`room:${room.code}`);
          socket.join(`room:${room.code}:players`);

          callback({ success: true, sessionId });

          // Notify host and all players
          io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
          io.to(`room:${room.code}`).emit('player_joined', {
            id: sessionId,
            name: player.name,
            connected: connectedCount(room),
            total: room.players.size,
          });
          console.log(`[Room] ${player.name} joined ${room.code}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'UNKNOWN';
          callback({ success: false, error: msg });
        }
      }
    );

    // ── PLAYER READY ─────────────────────────────────────────────────────────
    socket.on('player_ready', async (data: { roomCode: string }) => {
      const conn = connectionMap.get(socket.id);
      if (!conn || conn.isHost) return;
      const room = await getRoom(data.roomCode);
      if (!room) return;

      await updatePlayer(room.code, conn.sessionId, { isReady: true });
      const player = room.players.get(conn.sessionId);

      io.to(`room:${room.code}:host`).emit('player_ready_update', {
        playerId: conn.sessionId,
        playerName: player?.name,
        ready: true,
      });
      io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));

      // Check if all ready
      if (allPlayersReady(room)) {
        io.to(`room:${room.code}:host`).emit('all_players_ready', {});
      }
    });

    // ── RANDOMIZE ROLES ──────────────────────────────────────────────────────
    socket.on(
      'randomize_roles',
      async (data: { roomCode: string; imposterCount?: number }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const players = [...room.players.values()];
        if (players.length < 2)
          return callback?.({ success: false, error: 'NOT_ENOUGH_PLAYERS' });

        const assignments = randomizeRoles(
          players,
          data.imposterCount || 1,
          room.lastImposterIds
        );

        const validation = validateAssignments(assignments, data.imposterCount || 1);
        if (!validation.valid) return callback?.({ success: false, error: validation.error });

        // Apply roles to players
        for (const a of assignments) {
          await updatePlayer(room.code, a.playerId, { role: a.role, isReady: false });
          // Send each player their own secret role
          const player = room.players.get(a.playerId);
          if (player?.isConnected) {
            io.to(player.socketId).emit('role_assigned', {
              role: a.role,
              videoId: a.role === 'CREW' ? room.crewSong?.videoId : room.imposterSong?.videoId,
            });
          }
        }

        // Track imposter history
        const imposterIds = assignments
          .filter((a) => a.role === 'IMPOSTER')
          .map((a) => a.playerId);
        room.lastImposterIds = imposterIds;
        room.state = 'READY_CHECK';

        // Send host the full assignment
        io.to(`room:${room.code}:host`).emit('roles_assigned', {
          assignments: assignments.map((a) => ({
            playerId: a.playerId,
            playerName: room.players.get(a.playerId)?.name,
            role: a.role,
          })),
        });
        io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
        io.to(`room:${room.code}`).emit('game_state_update', { state: 'READY_CHECK' });

        callback?.({ success: true });
      }
    );

    // ── ASSIGN ROLE (manual) ─────────────────────────────────────────────────
    socket.on(
      'assign_role',
      async (
        data: { roomCode: string; playerId: string; role: PlayerRole },
        callback?: any
      ) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        await updatePlayer(room.code, data.playerId, { role: data.role });
        const player = room.players.get(data.playerId);
        if (player?.isConnected) {
          io.to(player.socketId).emit('role_assigned', { role: data.role });
        }

        io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
        callback?.({ success: true });
      }
    );

    // ── LOAD SONG ────────────────────────────────────────────────────────────
    socket.on(
      'load_song',
      async (data: { roomCode: string; role: PlayerRole; url: string }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const videoId = extractVideoId(data.url);
        if (!videoId) return callback?.({ success: false, error: 'INVALID_URL' });

        const song = { videoId, loadedAt: Date.now() };
        if (data.role === 'CREW') room.crewSong = song;
        else room.imposterSong = song;

        // Notify players of that role
        [...room.players.values()]
          .filter((p) => p.role === data.role && p.isConnected)
          .forEach((p) => {
            io.to(p.socketId).emit('song_loaded', { role: data.role, videoId });
          });

        io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
        callback?.({ success: true, videoId });
      }
    );

    // ── PLAY SONG ────────────────────────────────────────────────────────────
    socket.on(
      'play_song',
      async (
        data: { roomCode: string; role: PlayerRole; startPosition?: number },
        callback?: any
      ) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        try {
          const cmd = buildPlayCommand(room, data.role, data.startPosition || 0);
          [...room.players.values()]
            .filter((p) => p.role === data.role && p.isConnected)
            .forEach((p) => {
              io.to(p.socketId).emit('play_command', cmd);
            });

          if (room.state === 'READY_CHECK' || room.state === 'NEXT_ROUND') {
            room.state = 'PLAYING';
            io.to(`room:${room.code}`).emit('game_state_update', { state: 'PLAYING' });
          }

          startSyncInterval(io, room.code);
          callback?.({ success: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'UNKNOWN';
          callback?.({ success: false, error: msg });
        }
      }
    );

    // ── START ROUND (synchronized, plays both songs) ─────────────────────────
    socket.on(
      'start_round',
      async (data: { roomCode: string }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const serverTime = Date.now();
        const startAt = serverTime + 800; // 800ms buffer for all clients to prepare

        // Build and send crew command
        if (room.crewSong) {
          const crewCmd = {
            videoId: room.crewSong.videoId,
            serverTime,
            startAt,
            startPosition: room.crewPlayback.pausePosition || 0,
          };
          room.crewPlayback.isPlaying = true;
          room.crewPlayback.startedAt = serverTime;
          room.crewPlayback.scheduledStartAt = startAt;
          room.crewPlayback.seekPosition = crewCmd.startPosition;

          [...room.players.values()]
            .filter((p) => p.role === 'CREW' && p.isConnected)
            .forEach((p) => io.to(p.socketId).emit('play_command', crewCmd));
        }

        // Build and send imposter command
        if (room.imposterSong) {
          const impCmd = {
            videoId: room.imposterSong.videoId,
            serverTime,
            startAt,
            startPosition: room.imposterPlayback.pausePosition || 0,
          };
          room.imposterPlayback.isPlaying = true;
          room.imposterPlayback.startedAt = serverTime;
          room.imposterPlayback.scheduledStartAt = startAt;
          room.imposterPlayback.seekPosition = impCmd.startPosition;

          [...room.players.values()]
            .filter((p) => p.role === 'IMPOSTER' && p.isConnected)
            .forEach((p) => io.to(p.socketId).emit('play_command', impCmd));
        }

        room.state = 'PLAYING';
        io.to(`room:${room.code}`).emit('round_started', {
          round: room.round,
          serverTime,
          startAt,
        });
        io.to(`room:${room.code}`).emit('game_state_update', { state: 'PLAYING' });
        startSyncInterval(io, room.code);
        callback?.({ success: true });
      }
    );

    // ── PAUSE SONG ───────────────────────────────────────────────────────────
    socket.on(
      'pause_song',
      async (
        data: { roomCode: string; role: PlayerRole; currentPosition?: number },
        callback?: any
      ) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const playback = data.role === 'CREW' ? room.crewPlayback : room.imposterPlayback;
        const position = data.currentPosition ?? getExpectedPosition(playback);
        pausePlayback(playback, position);

        [...room.players.values()]
          .filter((p) => p.role === data.role && p.isConnected)
          .forEach((p) => io.to(p.socketId).emit('pause_command', { position }));

        room.state = 'PAUSED';
        io.to(`room:${room.code}`).emit('game_state_update', { state: 'PAUSED' });
        callback?.({ success: true });
      }
    );

    // ── STOP SONG ────────────────────────────────────────────────────────────
    socket.on(
      'stop_song',
      async (data: { roomCode: string; role: PlayerRole }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const playback = data.role === 'CREW' ? room.crewPlayback : room.imposterPlayback;
        stopPlayback(playback);

        [...room.players.values()]
          .filter((p) => p.role === data.role && p.isConnected)
          .forEach((p) => io.to(p.socketId).emit('stop_command', {}));

        callback?.({ success: true });
      }
    );

    // ── SEEK SONG ────────────────────────────────────────────────────────────
    socket.on(
      'seek_song',
      async (
        data: { roomCode: string; role: PlayerRole; position: number },
        callback?: any
      ) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const playback = data.role === 'CREW' ? room.crewPlayback : room.imposterPlayback;
        playback.seekPosition = data.position;
        if (playback.isPlaying) {
          playback.scheduledStartAt = Date.now();
        } else {
          playback.pausePosition = data.position;
        }

        [...room.players.values()]
          .filter((p) => p.role === data.role && p.isConnected)
          .forEach((p) =>
            io.to(p.socketId).emit('seek_command', { position: data.position })
          );

        callback?.({ success: true });
      }
    );

    // ── END ROUND ────────────────────────────────────────────────────────────
    socket.on('end_round', async (data: { roomCode: string }, callback?: any) => {
      const conn = connectionMap.get(socket.id);
      if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
      const room = await getRoom(data.roomCode);
      if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

      stopSyncInterval(room.code);
      stopPlayback(room.crewPlayback);
      stopPlayback(room.imposterPlayback);

      const imposters = getImposters(room);
      room.state = 'ROUND_COMPLETE';

      // Stop audio on all players
      io.to(`room:${room.code}`).emit('stop_command', {});
      // Tell everyone the round ended (no imposter name)
      io.to(`room:${room.code}`).emit('round_ended', { round: room.round });
      io.to(`room:${room.code}`).emit('game_state_update', { state: 'ROUND_COMPLETE' });

      // ⚠️  Imposter identity sent to HOST ONLY — players must find out by voting/discussion
      io.to(`room:${room.code}:host`).emit('imposter_revealed', {
        imposters: imposters.map((p) => ({ id: p.id, name: p.name })),
      });

      callback?.({ success: true });
    });

    // ── NEXT ROUND ───────────────────────────────────────────────────────────
    socket.on('next_round', async (data: { roomCode: string }, callback?: any) => {
      const conn = connectionMap.get(socket.id);
      if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
      const room = await getRoom(data.roomCode);
      if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

      room.round += 1;
      room.state = 'NEXT_ROUND';

      // Reset ready states
      for (const player of room.players.values()) {
        player.isReady = false;
        player.role = undefined;
      }

      io.to(`room:${room.code}`).emit('game_state_update', { state: 'NEXT_ROUND' });
      io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
      callback?.({ success: true });
    });

    // ── RANDOMIZE NEXT IMPOSTER (for next round) ─────────────────────────────
    socket.on(
      'randomize_next_imposter',
      async (data: { roomCode: string }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const players = [...room.players.values()];
        const assignments = pickNextImposter(players, room.lastImposterIds);

        for (const a of assignments) {
          await updatePlayer(room.code, a.playerId, { role: a.role, isReady: false });
          const player = room.players.get(a.playerId);
          if (player?.isConnected) {
            io.to(player.socketId).emit('role_assigned', {
              role: a.role,
              videoId: a.role === 'CREW' ? room.crewSong?.videoId : room.imposterSong?.videoId,
            });
          }
        }

        const imposterIds = assignments
          .filter((a) => a.role === 'IMPOSTER')
          .map((a) => a.playerId);
        room.lastImposterIds = imposterIds;
        room.state = 'READY_CHECK';

        io.to(`room:${room.code}:host`).emit('roles_assigned', {
          assignments: assignments.map((a) => ({
            playerId: a.playerId,
            playerName: room.players.get(a.playerId)?.name,
            role: a.role,
          })),
        });
        io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
        io.to(`room:${room.code}`).emit('game_state_update', { state: 'READY_CHECK' });
        callback?.({ success: true });
      }
    );

    // ── KICK PLAYER ──────────────────────────────────────────────────────────
    socket.on(
      'kick_player',
      async (data: { roomCode: string; playerId: string }, callback?: any) => {
        const conn = connectionMap.get(socket.id);
        if (!conn?.isHost) return callback?.({ success: false, error: 'NOT_HOST' });
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });

        const player = room.players.get(data.playerId);
        if (player) {
          io.to(player.socketId).emit('kicked', {});
        }
        await removePlayer(room.code, data.playerId);
        io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
        io.to(`room:${room.code}`).emit('player_left', { playerId: data.playerId });
        callback?.({ success: true });
      }
    );

    // ── PLAYER HEARTBEAT ──────────────────────────────────────────────────────
    socket.on(
      'player_heartbeat',
      async (data: { roomCode: string; sessionId: string }) => {
        const code = (data.roomCode || '').trim().toUpperCase();
        const room = await getRoom(code);
        if (!room) return;
        const player = room.players.get(data.sessionId);
        if (player) {
          let updated = false;
          if (!player.isConnected) {
            player.isConnected = true;
            updated = true;
          }
          if (player.socketId !== socket.id) {
            player.socketId = socket.id;
            sessionMap.set(data.sessionId, socket.id);
            connectionMap.set(socket.id, { sessionId: data.sessionId, roomCode: room.code, isHost: false });
            updated = true;
          }
          if (updated) {
            io.to(`room:${room.code}:host`).emit('room_state', buildHostRoomState(room));
          }
        }
      }
    );

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnecting', async () => {
      const conn = connectionMap.get(socket.id);
      if (!conn) return;
      const { sessionId, roomCode, isHost } = conn;

      const room = await getRoom(roomCode);
      if (!room) return;

      if (isHost) {
        if (room.hostSocketId === socket.id) {
          room.hostDisconnectedAt = Date.now();
          io.to(`room:${roomCode}`).emit('host_disconnected', {});
          console.log(`[Room] Host disconnected from ${roomCode}`);
        }
      } else {
        const player = room.players.get(sessionId);
        // Only mark disconnected if this socket is STILL the player's active socket
        if (player && player.socketId === socket.id) {
          await updatePlayer(roomCode, sessionId, { isConnected: false });
          io.to(`room:${roomCode}:host`).emit('player_disconnected', {
            playerId: sessionId,
            playerName: player?.name,
          });
          io.to(`room:${roomCode}:host`).emit('room_state', buildHostRoomState(room));
          io.to(`room:${roomCode}`).emit('player_left', {
            playerId: sessionId,
            playerName: player?.name,
            connected: connectedCount(room),
            total: room.players.size,
          });
          console.log(`[Room] ${player?.name} disconnected from ${roomCode}`);
        } else {
          console.log(`[Room] Ignored stale disconnect for ${player?.name} (socket: ${socket.id})`);
        }
      }
    });

    socket.on('disconnect', () => {
      connectionMap.delete(socket.id);
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });

    // ── HOST RECONNECT ───────────────────────────────────────────────────────
    socket.on(
      'host_reconnect',
      async (data: { roomCode: string; sessionId: string }, callback?: any) => {
        const room = await getRoom(data.roomCode);
        if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });
        if (room.hostId !== data.sessionId)
          return callback?.({ success: false, error: 'NOT_HOST' });

        room.hostSocketId = socket.id;
        room.hostDisconnectedAt = undefined;
        sessionMap.set(data.sessionId, socket.id);
        connectionMap.set(socket.id, {
          sessionId: data.sessionId,
          roomCode: room.code,
          isHost: true,
        });
        socket.join(`room:${room.code}`);
        socket.join(`room:${room.code}:host`);

        socket.emit('room_state', buildHostRoomState(room));
        io.to(`room:${room.code}`).emit('host_reconnected', {});
        callback?.({ success: true });
        console.log(`[Room] Host reconnected to ${room.code}`);
      }
    );

    // ── GET ROOM STATE (for host dashboard refresh) ──────────────────────────
    socket.on('get_room_state', async (data: { roomCode: string }, callback?: any) => {
      const room = await getRoom(data.roomCode);
      if (!room) return callback?.({ success: false, error: 'ROOM_NOT_FOUND' });
      // Return full host state (with roles) if caller is host, public state otherwise
      const conn = connectionMap.get(socket.id);
      const state = conn?.isHost ? buildHostRoomState(room) : buildPublicRoomState(room);
      callback?.({ success: true, state });
    });
  });
}

