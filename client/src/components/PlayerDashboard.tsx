'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { getOrCreateSessionId, saveRoomSession, getRoomSession } from '@/lib/session';
import { GameState, PlayerRole, PlayCommand, SyncCheck } from '@/types/game';
import YouTubePlayer, { YouTubePlayerHandle } from '@/components/YouTubePlayer';

const SYNC_DRIFT_THRESHOLD = 1.5; // seconds before we correct drift

export default function PlayerDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [roomCode, setRoomCode] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const ytRef = useRef<YouTubePlayerHandle>(null);
  const socketRef = useRef(connectSocket());
  const sessionId = useRef(getOrCreateSessionId());
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const schedulePlay = useCallback((startAt: number, startPosition: number) => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    const delay = Math.max(0, startAt - Date.now());
    playTimerRef.current = setTimeout(() => {
      if (startPosition > 0) ytRef.current?.seekTo(startPosition);
      ytRef.current?.play();
      setIsPlaying(true);
    }, delay);
  }, []);

  // Join or reconnect
  useEffect(() => {
    const qRoom = searchParams.get('room');
    const qName = searchParams.get('name');
    const session = getRoomSession();

    const code = qRoom || session?.roomCode || '';
    const name = qName ? decodeURIComponent(qName) : session?.playerName || '';

    if (!code || !name) { router.push('/join'); return; }

    setRoomCode(code);
    setPlayerName(name);

    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    const doJoin = () => {
      socket.emit('join_room', { roomCode: code, playerName: name, sessionId: sessionId.current }, (res: { success: boolean; sessionId?: string; error?: string; reconnected?: boolean }) => {
        if (!res.success) {
          const msgs: Record<string, string> = {
            ROOM_NOT_FOUND: 'Room not found.',
            GAME_IN_PROGRESS: 'Game already in progress.',
            ROOM_FULL: 'Room is full.',
          };
          alert(msgs[res.error || ''] || 'Could not join game.');
          router.push('/join');
        }
      });
    };

    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [searchParams, router]);

  // Socket events
  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => { setConnected(true); setReconnecting(false); };
    const onDisconnect = () => { setConnected(false); setReconnecting(true); };
    const onReconnected = () => { setReconnecting(false); };

    const onRoleAssigned = (data: { role: PlayerRole; videoId?: string }) => {
      setRole(data.role);
      setGameState('READY_CHECK');
      setPlayerReady(false);
      if (data.videoId) {
        setCurrentVideoId(data.videoId);
      }
    };

    const onReconnectedState = (data: {
      role?: PlayerRole; state: GameState; videoId?: string;
      expectedPosition: number; isPlaying: boolean;
    }) => {
      if (data.role) setRole(data.role);
      setGameState(data.state);
      if (data.videoId) {
        setCurrentVideoId(data.videoId);
        setTimeout(() => {
          ytRef.current?.loadVideo(data.videoId!);
          if (data.isPlaying) {
            ytRef.current?.seekTo(data.expectedPosition);
            ytRef.current?.play();
            setIsPlaying(true);
          }
        }, 1000);
      }
    };

    const onSongLoaded = (data: { videoId: string }) => {
      setCurrentVideoId(data.videoId);
      if (ytReady) {
        ytRef.current?.loadVideo(data.videoId);
      }
    };

    const onPlayCommand = (data: PlayCommand) => {
      setCurrentVideoId(data.videoId);
      if (ytReady) {
        ytRef.current?.loadVideo(data.videoId);
        schedulePlay(data.startAt, data.startPosition);
      }
    };

    const onPauseCommand = (data: { position?: number }) => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      ytRef.current?.pause();
      setIsPlaying(false);
    };

    const onStopCommand = () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      ytRef.current?.stop();
      setIsPlaying(false);
    };

    const onSeekCommand = (data: { position: number }) => {
      ytRef.current?.seekTo(data.position);
    };

    const onSyncCheck = (data: SyncCheck) => {
      const currentTime = ytRef.current?.getCurrentTime() || 0;
      const drift = data.expectedPosition - currentTime;
      if (Math.abs(drift) > SYNC_DRIFT_THRESHOLD) {
        ytRef.current?.seekTo(data.expectedPosition);
      }
    };

    const onGameStateUpdate = (data: { state: GameState }) => {
      setGameState(data.state);
      if (data.state === 'ROUND_COMPLETE') {
        ytRef.current?.stop();
        setIsPlaying(false);
      }
      if (data.state === 'NEXT_ROUND') {
        setPlayerReady(false);
        setRole(null);
        setCurrentVideoId(null);
      }
    };

    const onRoundEnded = () => { setGameState('ROUND_COMPLETE'); };
    // NOTE: imposter_revealed is NOT listened to here — players must
    // figure out the imposter themselves through discussion and voting.
    const onRoundStarted = () => { setGameState('PLAYING'); };
    const onHostDisconnected = () => setHostDisconnected(true);
    const onHostReconnected = () => setHostDisconnected(false);
    const onKicked = () => setKicked(true);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect', onReconnected);
    socket.on('role_assigned', onRoleAssigned);
    socket.on('reconnected', onReconnectedState);
    socket.on('song_loaded', onSongLoaded);
    socket.on('play_command', onPlayCommand);
    socket.on('pause_command', onPauseCommand);
    socket.on('stop_command', onStopCommand);
    socket.on('seek_command', onSeekCommand);
    socket.on('sync_check', onSyncCheck);
    socket.on('game_state_update', onGameStateUpdate);
    socket.on('round_started', onRoundStarted);
    socket.on('round_ended', onRoundEnded);
    // No listener for 'imposter_revealed' on player — host only
    socket.on('host_disconnected', onHostDisconnected);
    socket.on('host_reconnected', onHostReconnected);
    socket.on('kicked', onKicked);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect', onReconnected);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('reconnected', onReconnectedState);
      socket.off('song_loaded', onSongLoaded);
      socket.off('play_command', onPlayCommand);
      socket.off('pause_command', onPauseCommand);
      socket.off('stop_command', onStopCommand);
      socket.off('seek_command', onSeekCommand);
      socket.off('sync_check', onSyncCheck);
      socket.off('game_state_update', onGameStateUpdate);
      socket.off('round_started', onRoundStarted);
      socket.off('round_ended', onRoundEnded);
      socket.off('host_disconnected', onHostDisconnected);
      socket.off('host_reconnected', onHostReconnected);
      socket.off('kicked', onKicked);
    };
  }, [schedulePlay, ytReady]);

  // Load video when YT becomes ready
  useEffect(() => {
    if (ytReady && currentVideoId) {
      ytRef.current?.loadVideo(currentVideoId);
    }
  }, [ytReady, currentVideoId]);

  const handleYtReady = useCallback(() => {
    setYtReady(true);
    setYtError(null);
  }, []);

  const handleYtError = useCallback((code: number) => {
    const msgs: Record<number, string> = {
      2: 'Invalid video ID.',
      5: 'HTML5 player error.',
      100: 'Video not found or removed.',
      101: 'Video cannot be embedded.',
      150: 'Video cannot be embedded.',
    };
    setYtError(msgs[code] || 'YouTube error. Try another video.');
  }, []);

  const handleReady = () => {
    // This satisfies browser autoplay policy
    if (currentVideoId && ytReady) {
      ytRef.current?.loadVideo(currentVideoId);
    }
    socketRef.current.emit('player_ready', { roomCode });
    setPlayerReady(true);
  };

  // ── Kicked ─────────────────────────────────────────────────────────────────
  if (kicked) {
    return (
      <div className="page-container" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="animate-fade-in">
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>😔</div>
          <h1 style={{ marginBottom: '8px' }}>Removed from game</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>The host removed you from the game.</p>
          <button className="btn btn-primary" onClick={() => router.push('/')}>Back to Home</button>
        </div>
      </div>
    );
  }

  const isCrew = role === 'CREW';
  const roleColor = role ? (isCrew ? 'var(--crew-primary)' : 'var(--imposter-primary)') : 'transparent';
  const roleGlow = role ? (isCrew ? 'var(--crew-glow)' : 'var(--imposter-glow)') : 'none';
  const roleColorLight = role ? (isCrew ? 'var(--crew-light)' : 'var(--imposter-light)') : 'var(--text-primary)';

  return (
    <div className="page-container" style={{ justifyContent: 'flex-start', paddingTop: '24px', gap: '16px' }}>
      {/* Hidden YouTube player — audio only */}
      <YouTubePlayer
        ref={ytRef}
        onReady={handleYtReady}
        onError={handleYtError}
        hidden
      />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="logo-text" style={{ fontSize: '1.1rem' }}>🎵 Find the Imposter</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className={`status-dot ${reconnecting ? 'status-dot-yellow' : connected ? 'status-dot-green' : 'status-dot-red'}`} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {reconnecting ? 'Reconnecting...' : connected ? `${roomCode}` : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Host disconnected warning ── */}
      {hostDisconnected && (
        <div className="card" style={{ padding: '16px', textAlign: 'center', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>⚠️ Game Master disconnected</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Waiting for reconnection...</div>
        </div>
      )}

      {/* ── YT Error ── */}
      {ytError && (
        <div className="card" style={{ padding: '12px 16px', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--imposter-light)', fontSize: '0.85rem' }}>
          ⚠️ {ytError}
        </div>
      )}

      {/* ── Player name + status ── */}
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.1em' }}>PLAYER</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{playerName}</div>
      </div>

      {/* ── LOBBY / WAITING ── */}
      {(gameState === 'LOBBY' || gameState === 'WAITING') && (
        <div className="card animate-fade-in" style={{ padding: '32px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '2.5rem' }}>⏳</div>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Waiting for Game Master...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Roles will be assigned soon.</p>
        </div>
      )}

      {/* ── ROLE ASSIGNMENT (role just assigned, not yet ready) ── */}
      {gameState === 'READY_CHECK' && role && !playerReady && (
        <div className="animate-flip-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Role Card */}
          <div
            className="card"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              border: `2px solid ${roleColor}`,
              background: isCrew ? 'rgba(124,58,237,0.08)' : 'rgba(239,68,68,0.08)',
              boxShadow: `0 0 40px ${roleGlow}`,
              animation: `${isCrew ? 'glow-crew' : 'glow-imposter'} 2s ease-in-out infinite`,
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '12px' }}>
              {isCrew ? '👥' : '🕵️'}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: '8px' }}>YOUR ROLE</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: roleColorLight, letterSpacing: '-0.02em' }}>
              {isCrew ? 'CREW' : 'IMPOSTER'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '12px' }}>
              {isCrew ? '🎵 You will hear the crew song.' : '🎵 You will hear the imposter song.'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '8px', fontStyle: 'italic' }}>
              Keep this secret!
            </div>
          </div>

          {/* Ready Button */}
          <button
            className={`btn btn-lg btn-full ${isCrew ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleReady}
            style={{ marginTop: '8px' }}
          >
            <span>🔊</span>
            <span>Ready to Play</span>
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.5 }}>
            Tap Ready to enable audio on your device.<br />
            The game starts when everyone is ready.
          </p>
        </div>
      )}

      {/* ── Waiting after ready ── */}
      {gameState === 'READY_CHECK' && playerReady && (
        <div className="card animate-fade-in" style={{ padding: '32px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '2rem' }}>✅</div>
          <h2 style={{ color: 'var(--accent-green)', fontSize: '1.2rem' }}>You're Ready!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for Game Master to start...</p>
          {/* Show role reminder */}
          {role && (
            <div style={{ marginTop: '8px' }}>
              <span className={`role-badge ${isCrew ? 'role-badge-crew' : 'role-badge-imposter'}`}>
                {isCrew ? '👥 CREW' : '🕵️ IMPOSTER'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── PLAYING ── */}
      {gameState === 'PLAYING' && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '40px 24px', textAlign: 'center', flex: 1,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px',
            border: `1px solid ${roleColor}`,
            background: isCrew ? 'rgba(124,58,237,0.06)' : 'rgba(239,68,68,0.06)',
          }}
        >
          {/* Animated sound waves */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '40px' }}>
            {[1,2,3,4,5,6,7].map((i) => (
              <div key={i} style={{
                width: '4px',
                background: roleColorLight,
                borderRadius: '2px',
                animation: `pulse-green ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.07}s`,
                height: `${20 + Math.sin(i) * 15}px`,
                opacity: isPlaying ? 1 : 0.2,
                transition: 'opacity 0.5s',
              }} />
            ))}
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {isPlaying ? 'NOW PLAYING' : 'WAITING FOR AUDIO'}
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: roleColorLight }}>
              {isCrew ? '🎵 Crew Song' : '🎵 Imposter Song'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
              Listen carefully. Find the imposter.
            </p>
          </div>

          <span className={`role-badge ${isCrew ? 'role-badge-crew' : 'role-badge-imposter'}`} style={{ alignSelf: 'center' }}>
            {isCrew ? '👥 CREW' : '🕵️ IMPOSTER'}
          </span>
        </div>
      )}

      {/* ── PAUSED ── */}
      {gameState === 'PAUSED' && (
        <div className="card animate-fade-in" style={{ padding: '40px 24px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '3rem' }}>⏸</div>
          <h2 style={{ color: 'var(--accent-gold)', fontSize: '1.2rem' }}>Game Paused</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>The Game Master paused the game.</p>
        </div>
      )}

      {/* ── ROUND COMPLETE ── */}
      {gameState === 'ROUND_COMPLETE' && (
        <div className="card animate-slide-up" style={{ padding: '32px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
          <div style={{ fontSize: '3rem' }}>🏁</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Round Over!</h2>

          {/* Discussion prompt — no imposter revealed */}
          <div style={{
            padding: '20px',
            background: 'rgba(124,58,237,0.08)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(124,58,237,0.25)',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🗣️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crew-light)', marginBottom: '6px' }}>
              Discuss with your group!
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
              Who was hearing a different song?<br />
              Vote for who you think the imposter is.
            </p>
          </div>

          {/* Show only the player's own role — never others */}
          {role && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              You were{' '}
              <span style={{ fontWeight: 700, color: isCrew ? 'var(--crew-light)' : 'var(--imposter-light)' }}>
                {isCrew ? 'Crew 👥' : 'the Imposter 🕵️'}
              </span>
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Waiting for Game Master...</p>
        </div>
      )}

      {/* ── NEXT ROUND ── */}
      {gameState === 'NEXT_ROUND' && (
        <div className="card animate-fade-in" style={{ padding: '40px 24px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '3rem' }}>🔄</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Next Round</h2>
          <p style={{ color: 'var(--text-secondary)' }}>New roles are being assigned...</p>
        </div>
      )}
    </div>
  );
}
