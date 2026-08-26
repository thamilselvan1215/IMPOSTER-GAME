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

    if (!code || !name) {
      router.push('/join');
      return;
    }

    setRoomCode(code);
    setPlayerName(name);

    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    // Called every time the socket connects (initial join AND every reconnect).
    // Re-emitting join_room on reconnect updates isConnected=true on the server
    // so the host dashboard shows the correct status.
    const doJoin = () => {
      socket.emit(
        'join_room',
        { roomCode: code, playerName: name, sessionId: sessionId.current },
        (res: { success: boolean; sessionId?: string; error?: string; reconnected?: boolean }) => {
          if (!res.success) {
            // Only redirect on hard failures, not temporary ones
            if (res.error === 'ROOM_NOT_FOUND' || res.error === 'ROOM_FULL') {
              const msgs: Record<string, string> = {
                ROOM_NOT_FOUND: 'Room not found.',
                GAME_IN_PROGRESS: 'Game already in progress.',
                ROOM_FULL: 'Room is full.',
              };
              alert(msgs[res.error || ''] || 'Could not join game.');
              router.push('/join');
            }
            // GAME_IN_PROGRESS is ok — player is reconnecting mid-game
          }
        }
      );
    };

    // On first connect
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    // On every subsequent reconnect, re-join to update server's isConnected status
    socket.on('connect', doJoin);

    return () => {
      socket.off('connect', doJoin);
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [searchParams, router]);

  // Bluetooth headphones, Battery level, and Audio status tracking
  const [bluetoothConnected, setBluetoothConnected] = useState<boolean>(true);
  const [batteryLevel, setBatteryLevel] = useState<number | undefined>(undefined);
  const [audioStatus, setAudioStatus] = useState<'ready' | 'downloading' | 'failed' | 'idle'>('idle');

  useEffect(() => {
    // 1. Detect audio output devices (Bluetooth headphones / headsets)
    const checkAudioDevices = async () => {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
          // If audio outputs exist or bluetooth is available
          setBluetoothConnected(audioOutputs.length > 0);
        } catch {
          setBluetoothConnected(true);
        }
      }
    };

    checkAudioDevices();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = checkAudioDevices;
    }

    // 2. Battery level if supported
    if (typeof navigator !== 'undefined' && (navigator as any).getBattery) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.onlevelchange = () => {
          setBatteryLevel(Math.round(battery.level * 100));
        };
      }).catch(() => {});
    }
  }, []);

  // Heartbeat & status reporting to maintain active online status and report Bluetooth/Audio status
  useEffect(() => {
    if (!roomCode) return;
    const socket = socketRef.current;
    const interval = setInterval(() => {
      if (socket.connected) {
        const currentTime = ytRef.current?.getCurrentTime() || 0;
        socket.emit('player_heartbeat', { roomCode, sessionId: sessionId.current });
        socket.emit('player_status', {
          roomCode,
          sessionId: sessionId.current,
          bluetoothConnected,
          audioStatus,
          batteryLevel,
          currentPosition: currentTime,
          isPlaying,
        });
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [roomCode, bluetoothConnected, audioStatus, batteryLevel, isPlaying]);

  // Socket events
  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => {
      setConnected(true);
      setReconnecting(false);
    };
    const onDisconnect = () => {
      setConnected(false);
      setReconnecting(true);
    };
    const onReconnected = () => {
      setReconnecting(false);
    };

    const onRoleAssigned = (data: { role: PlayerRole; videoId?: string }) => {
      setGameState('READY_CHECK');
      setPlayerReady(false);
      if (data.videoId) {
        setCurrentVideoId(data.videoId);
        ytRef.current?.loadVideo(data.videoId);
      }
    };

    const onReconnectedState = (data: {
      role?: PlayerRole;
      state: GameState;
      videoId?: string;
      expectedPosition: number;
      isPlaying: boolean;
    }) => {
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
        }, 800);
      }
    };

    const onSongLoaded = (data: { videoId: string }) => {
      setCurrentVideoId(data.videoId);
      ytRef.current?.loadVideo(data.videoId);
    };

    const onPlayCommand = (data: PlayCommand) => {
      setGameState('PLAYING');
      setIsPlaying(true);
      if (data.videoId) {
        setCurrentVideoId(data.videoId);
        ytRef.current?.loadVideo(data.videoId);
      }
      schedulePlay(data.startAt, data.startPosition);
    };

    const onPauseCommand = () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      ytRef.current?.pause();
      setIsPlaying(false);
      setGameState('PAUSED');
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
        setCurrentVideoId(null);
      }
    };

    const onRoundEnded = () => {
      setGameState('ROUND_COMPLETE');
    };
    const onRoundStarted = () => {
      setGameState('PLAYING');
    };
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
  }, [schedulePlay]);

  // Load video when YT becomes ready or videoId changes
  useEffect(() => {
    if (currentVideoId) {
      ytRef.current?.loadVideo(currentVideoId);
    }
  }, [ytReady, currentVideoId]);

  const handleYtReady = useCallback(() => {
    setYtReady(true);
    setYtError(null);
    if (currentVideoId) {
      ytRef.current?.loadVideo(currentVideoId);
    }
  }, [currentVideoId]);

  const handleYtError = useCallback((code: number) => {
    const msgs: Record<number, string> = {
      2: 'Invalid video ID.',
      5: 'HTML5 player error.',
      100: 'Video not found or removed.',
      101: 'Video cannot be embedded by YouTube.',
      150: 'Video cannot be embedded by YouTube.',
    };
    setYtError(msgs[code] || 'YouTube error. Try another video.');
  }, []);

  const handleReady = () => {
    // Satisfy mobile browser media user gesture autoplay unlock policy
    if (currentVideoId) {
      ytRef.current?.loadVideo(currentVideoId);
      ytRef.current?.play();
      setTimeout(() => {
        ytRef.current?.pause();
      }, 150);
    }
    setAudioStatus('ready');
    socketRef.current.emit('player_ready', { roomCode });
    socketRef.current.emit('song_ready', { roomCode, sessionId: sessionId.current });
    setPlayerReady(true);
  };

  // ── Kicked ─────────────────────────────────────────────────────────────────
  if (kicked) {
    return (
      <div className="page-container" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="animate-fade-in">
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>😔</div>
          <h1 style={{ marginBottom: '8px' }}>Removed from game</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            The host removed you from the game.
          </p>
          <button className="btn btn-primary" onClick={() => router.push('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ justifyContent: 'flex-start', paddingTop: '24px', gap: '16px' }}>
      {/* Hidden YouTube player — audio only */}
      <YouTubePlayer ref={ytRef} onReady={handleYtReady} onError={handleYtError} hidden />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="logo-text" style={{ fontSize: '1.1rem' }}>
          🎵 Find the Imposter
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className={`status-dot ${
              reconnecting ? 'status-dot-yellow' : connected ? 'status-dot-green' : 'status-dot-red'
            }`}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {reconnecting ? 'Reconnecting...' : connected ? `${roomCode}` : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Host disconnected warning ── */}
      {hostDisconnected && (
        <div
          className="card"
          style={{
            padding: '16px',
            textAlign: 'center',
            borderColor: 'rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.08)',
          }}
        >
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>⚠️ Game Master disconnected</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Waiting for reconnection...
          </div>
        </div>
      )}

      {/* ── YT Error ── */}
      {ytError && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            borderColor: 'rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--imposter-light)',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {ytError}
        </div>
      )}

      {/* ── Player name + status ── */}
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <div
          style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.1em' }}
        >
          PLAYER
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{playerName}</div>
      </div>

      {/* ── LOBBY / WAITING ── */}
      {(gameState === 'LOBBY' || gameState === 'WAITING') && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '32px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '2.5rem' }}>⏳</div>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Waiting for Game Master...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Song assignment is in progress.</p>
        </div>
      )}

      {/* ── READY CHECK (Songs assigned, not yet ready) ── */}
      {gameState === 'READY_CHECK' && !playerReady && (
        <div className="animate-flip-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Audio Assignment Card (NO ROLE SHOWN) */}
          <div
            className="card"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              border: '2px solid var(--purple-light)',
              background: 'rgba(124,58,237,0.08)',
              boxShadow: '0 0 30px var(--crew-glow)',
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '12px' }}>🎧</div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                color: 'var(--text-muted)',
                marginBottom: '8px',
              }}
            >
              AUDIO ASSIGNED
            </div>
            <div
              style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              Song Ready
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '12px' }}>
              Tap Ready to enable audio playback on your device.
            </div>
          </div>

          {/* Ready Button */}
          <button
            className="btn btn-lg btn-full btn-primary"
            onClick={handleReady}
            style={{ marginTop: '8px' }}
          >
            <span>🔊</span>
            <span>Ready to Play</span>
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.5 }}>
            The round starts when all players tap Ready.
          </p>
        </div>
      )}

      {/* ── Waiting after ready ── */}
      {gameState === 'READY_CHECK' && playerReady && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '32px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '2rem' }}>✅</div>
          <h2 style={{ color: 'var(--accent-green)', fontSize: '1.2rem' }}>You're Ready!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for Game Master to start...</p>
        </div>
      )}

      {/* ── PLAYING ── */}
      {gameState === 'PLAYING' && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '20px',
            border: '1px solid var(--purple-light)',
            background: 'rgba(124,58,237,0.06)',
          }}
        >
          {/* Animated sound waves */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '40px' }}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                style={{
                  width: '4px',
                  background: 'var(--crew-light)',
                  borderRadius: '2px',
                  animation: `pulse-green ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.07}s`,
                  height: `${20 + Math.sin(i) * 15}px`,
                  opacity: isPlaying ? 1 : 0.2,
                  transition: 'opacity 0.5s',
                }}
              />
            ))}
          </div>

          <div>
            <div
              style={{ fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '8px' }}
            >
              {isPlaying ? 'NOW PLAYING' : 'LISTENING...'}
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--crew-light)' }}>
              🎵 Playing Audio
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
              Listen carefully to your song. Figure out who is hearing a different song.
            </p>
          </div>
        </div>
      )}

      {/* ── PAUSED ── */}
      {gameState === 'PAUSED' && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '3rem' }}>⏸</div>
          <h2 style={{ color: 'var(--accent-gold)', fontSize: '1.2rem' }}>Game Paused</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>The Game Master paused the game.</p>
        </div>
      )}

      {/* ── ROUND COMPLETE ── */}
      {gameState === 'ROUND_COMPLETE' && (
        <div
          className="card animate-slide-up"
          style={{
            padding: '32px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '20px',
          }}
        >
          <div style={{ fontSize: '3rem' }}>🏁</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Round Over!</h2>

          {/* Discussion prompt — NO ROLES SHOWN TO PLAYERS */}
          <div
            style={{
              padding: '20px',
              background: 'rgba(124,58,237,0.08)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(124,58,237,0.25)',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🗣️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crew-light)', marginBottom: '6px' }}>
              Discuss with your group!
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
              Who was hearing a different song?<br />
              Discuss and vote for who you think the imposter is.
            </p>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Waiting for Game Master...</p>
        </div>
      )}

      {/* ── NEXT ROUND ── */}
      {gameState === 'NEXT_ROUND' && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '3rem' }}>🔄</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Next Round</h2>
          <p style={{ color: 'var(--text-secondary)' }}>New songs are being assigned...</p>
        </div>
      )}
    </div>
  );
}
