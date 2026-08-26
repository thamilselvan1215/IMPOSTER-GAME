'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { getOrCreateSessionId, saveRoomSession, clearRoomSession } from '@/lib/session';
import { RoomState, RoleAssignmentEntry, GameState } from '@/types/game';
import PlayerList from '@/components/PlayerList';
import SongControl from '@/components/SongControl';
import QRCode from '@/components/QRCode';

export default function HostDashboard() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [crewPlaying, setCrewPlaying] = useState(false);
  const [imposterPlaying, setImposterPlaying] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [hostName, setHostName] = useState('');
  const [nameEntered, setNameEntered] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [gameMode, setGameMode] = useState<'offline' | 'online'>('offline');
  const [imposterRevealed, setImposterRevealed] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  // Playback position tracking (for seek slider)
  const [crewPosition, setCrewPosition] = useState(0);
  const [imposterPosition, setImposterPosition] = useState(0);
  const [crewDuration, setCrewDuration] = useState(0);
  const [imposterDuration, setImposterDuration] = useState(0);

  const socketRef = useRef(connectSocket());
  const sessionId = useRef(getOrCreateSessionId());

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Build join URL based on game mode and room code (includes ?code=XXXXXX for instant QR scanning join)
  useEffect(() => {
    const codeQuery = roomCode ? `?code=${roomCode}` : '';
    if (gameMode === 'online') {
      // Online mode: players use Vercel public URL
      const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/join${codeQuery}`
        : `${window.location.protocol}//${window.location.host}/join${codeQuery}`;
      setJoinUrl(vercelUrl);
    } else {
      // Offline mode: players connect via host's LAN IP
      let hostname = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : '';
      const protocol = window.location.protocol;

      if ((hostname === 'localhost' || hostname === '127.0.0.1') && process.env.NEXT_PUBLIC_SERVER_URL) {
        try {
          const serverUrl = new URL(process.env.NEXT_PUBLIC_SERVER_URL);
          if (serverUrl.hostname && serverUrl.hostname !== 'localhost' && serverUrl.hostname !== '127.0.0.1') {
            hostname = serverUrl.hostname;
          }
        } catch {
          // Fallback to window.location.hostname
        }
      }
      setJoinUrl(`${protocol}//${hostname}${port}/join${codeQuery}`);
    }
  }, [gameMode, roomCode]);

  // Socket event listeners
  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomState = (state: RoomState) => {
      setRoomState(state);
      setCrewPlaying(state.state === 'PLAYING');
      setImposterPlaying(state.state === 'PLAYING');
    };
    const onRolesAssigned = (data: { assignments: RoleAssignmentEntry[] }) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          players: prev.players.map((p) => {
            const a = data.assignments.find((x) => x.playerId === p.id);
            return a ? { ...p, role: a.role } : p;
          }),
        };
        return updated;
      });
      showToast('Roles assigned! Players can see their roles.', 'success');
    };
    const onAllReady = () => showToast('All players ready! You can start the game.', 'success');
    const onPlayerReadyUpdate = (data: { playerName: string; ready: boolean }) => {
      showToast(`${data.playerName} is ready ✓`, 'success');
    };
    const onImposterRevealed = (data: { imposters: { name: string }[] }) => {
      setImposterRevealed(data.imposters.map((i) => i.name));
    };

    const onPlayerJoined = (data: { name: string }) => {
      if (data?.name) showToast(`🎉 ${data.name} joined the game!`, 'success');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_state', onRoomState);
    socket.on('player_joined', onPlayerJoined);
    socket.on('roles_assigned', onRolesAssigned);
    socket.on('all_players_ready', onAllReady);
    socket.on('player_ready_update', onPlayerReadyUpdate);
    socket.on('imposter_revealed', onImposterRevealed);
    socket.on('game_state_update', (d: { state: GameState }) => {
      setRoomState((p) => (p ? { ...p, state: d.state } : p));
      if (d.state === 'PLAYING') {
        setCrewPlaying(true);
        setImposterPlaying(true);
      }
      if (d.state === 'PAUSED' || d.state === 'ROUND_COMPLETE') {
        setCrewPlaying(false);
        setImposterPlaying(false);
      }
    });
    // Track position from server sync pings
    socket.on('sync_check', (d: { role: string; expectedPosition: number }) => {
      if (d.role === 'CREW') setCrewPosition(d.expectedPosition);
      else setImposterPosition(d.expectedPosition);
    });
    // Update duration when host receives song_duration info
    socket.on('song_duration', (d: { role: string; duration: number }) => {
      if (d.role === 'CREW') setCrewDuration(d.duration);
      else setImposterDuration(d.duration);
    });

    if (socket.connected) setConnected(true);
    else socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', onRoomState);
      socket.off('roles_assigned', onRolesAssigned);
      socket.off('all_players_ready', onAllReady);
      socket.off('player_ready_update', onPlayerReadyUpdate);
      socket.off('imposter_revealed', onImposterRevealed);
    };
  }, [showToast]);

  // Try to reconnect if we have a saved session
  useEffect(() => {
    const saved = localStorage.getItem('fti_room_code');
    const isHost = localStorage.getItem('fti_is_host');
    if (saved && isHost === '1') {
      const socket = socketRef.current;
      if (!socket.connected) socket.connect();
      socket.emit(
        'host_reconnect',
        { roomCode: saved, sessionId: sessionId.current },
        (res: { success: boolean }) => {
          if (res?.success) {
            setRoomCode(saved);
            setNameEntered(true);
            setCreating(false);
          }
        }
      );
    }
  }, []);

  // Periodically refresh room state from the server (every 8s) as a safety net
  // so the host always sees up-to-date player connection status even if a socket
  // event was lost (e.g. during mobile reconnection).
  useEffect(() => {
    if (!roomCode) return;
    const socket = socketRef.current;
    const interval = setInterval(() => {
      if (!socket.connected) return;
      socket.emit('get_room_state', { roomCode }, (res: { success: boolean; state?: any }) => {
        if (res?.success && res.state) {
          setRoomState(res.state);
        }
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [roomCode]);



  const createRoom = () => {
    const name = hostName.trim();
    if (!name) return;
    setCreating(true);

    const socket = connectSocket();

    const doCreate = () => {
      socket.emit(
        'create_room',
        { hostName: name, sessionId: sessionId.current },
        (res: { success: boolean; roomCode?: string; error?: string }) => {
          setCreating(false);
          if (res.success && res.roomCode) {
            setRoomCode(res.roomCode);
            setNameEntered(true);
            saveRoomSession(res.roomCode, name, true);
            showToast('Room created!', 'success');
          } else {
            showToast(res.error || 'Failed to create room', 'error');
          }
        }
      );
    };

    if (socket.connected) {
      doCreate();
    } else {
      socket.connect();
      const onConn = () => {
        socket.off('connect', onConn);
        doCreate();
      };
      socket.on('connect', onConn);

      setTimeout(() => {
        if (!socket.connected) {
          socket.off('connect', onConn);
          setCreating(false);
          showToast('Server unreachable. Ensure server is running on port 3001.', 'error');
        }
      }, 5000);
    }
  };

  const randomizeRoles = () => {
    if (!roomCode) return;
    socketRef.current.emit('randomize_roles', { roomCode }, (res: { success: boolean; error?: string }) => {
      if (!res.success) showToast(res.error || 'Failed to randomize', 'error');
    });
  };

  const assignRole = (playerId: string, role: 'CREW' | 'IMPOSTER') => {
    if (!roomCode) return;
    socketRef.current.emit('assign_role', { roomCode, playerId, role }, () => {});
  };

  const handleLoadSong = (role: 'CREW' | 'IMPOSTER', url: string) => {
    if (!roomCode) return;
    socketRef.current.emit(
      'load_song',
      { roomCode, role, url },
      (res: { success: boolean; videoId?: string; error?: string }) => {
        if (res.success) showToast(`${role} song loaded!`, 'success');
        else showToast(res.error === 'INVALID_URL' ? 'Invalid YouTube URL' : 'Failed to load song', 'error');
      }
    );
  };

  const handlePlay = (role: 'CREW' | 'IMPOSTER') => {
    if (!roomCode) return;
    socketRef.current.emit('play_song', { roomCode, role }, (res: { success: boolean; error?: string }) => {
      if (res.success) {
        if (role === 'CREW') setCrewPlaying(true);
        else setImposterPlaying(true);
      } else showToast(res.error === 'SONG_NOT_LOADED' ? 'Load a song first!' : 'Failed to play', 'error');
    });
  };

  const handlePause = (role: 'CREW' | 'IMPOSTER') => {
    if (!roomCode) return;
    socketRef.current.emit('pause_song', { roomCode, role }, (res: { success: boolean }) => {
      if (res.success) {
        if (role === 'CREW') setCrewPlaying(false);
        else setImposterPlaying(false);
      }
    });
  };

  const handleStop = (role: 'CREW' | 'IMPOSTER') => {
    if (!roomCode) return;
    socketRef.current.emit('stop_song', { roomCode, role }, () => {
      if (role === 'CREW') {
        setCrewPlaying(false);
        setCrewPosition(0);
      } else {
        setImposterPlaying(false);
        setImposterPosition(0);
      }
    });
  };

  const handleSeek = (role: 'CREW' | 'IMPOSTER', position: number) => {
    if (!roomCode) return;
    socketRef.current.emit('seek_song', { roomCode, role, position }, (res: { success: boolean }) => {
      if (res?.success) {
        if (role === 'CREW') setCrewPosition(position);
        else setImposterPosition(position);
      }
    });
  };

  const startRound = () => {
    if (!roomCode) return;
    socketRef.current.emit('start_round', { roomCode }, (res: { success: boolean; error?: string }) => {
      if (!res.success) showToast(res.error || 'Could not start round', 'error');
      else {
        setCrewPlaying(true);
        setImposterPlaying(true);
        setImposterRevealed(null);
      }
    });
  };

  const endRound = () => {
    if (!roomCode) return;
    socketRef.current.emit('end_round', { roomCode }, () => {});
  };

  const nextRound = () => {
    if (!roomCode) return;
    setImposterRevealed(null);
    socketRef.current.emit('next_round', { roomCode }, () => {});
  };

  const randomizeNextImposter = () => {
    if (!roomCode) return;
    socketRef.current.emit('randomize_next_imposter', { roomCode }, (res: { success: boolean }) => {
      if (res.success) showToast('New imposter selected!', 'success');
    });
  };

  const kickPlayer = (playerId: string) => {
    if (!roomCode) return;
    socketRef.current.emit('kick_player', { roomCode, playerId }, () => showToast('Player kicked', 'error'));
  };

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const endGame = () => {
    clearRoomSession();
    router.push('/');
  };

  const state = roomState?.state;
  const players = roomState?.players || [];
  const connectedCount = roomState?.connected || 0;
  const totalCount = roomState?.total || 0;
  const maxPlayers = roomState?.maxPlayers || 15;
  const btConnectedCount = players.filter((p) => p.isConnected && (p.bluetoothConnected ?? true)).length;
  const audioReadyCount = players.filter((p) => p.isConnected && (p.audioStatus === 'ready' || p.isReady)).length;
  const allReady = players.filter((p) => p.isConnected).every((p) => p.isReady || p.audioStatus === 'ready') && players.length > 0;
  const hasRoles = players.some((p) => p.role);

  // ── Pre-room: mode selection + enter host name ─────────────────────────────
  if (!nameEntered || !roomCode) {
    return (
      <div className="page-container" style={{ justifyContent: 'center' }}>
        <div className="animate-fade-in" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎮</div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Game Master</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>You control the multi-device Wi-Fi audio session</p>
          </div>

          {/* ── Mode Selector ── */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '10px', textAlign: 'center' }}>SELECT MODE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Offline Mode Card */}
              <button
                onClick={() => setGameMode('offline')}
                style={{
                  padding: '18px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${gameMode === 'offline' ? 'var(--crew-primary)' : 'var(--border-subtle)'}`,
                  background: gameMode === 'offline' ? 'rgba(124,58,237,0.12)' : 'var(--card-bg)',
                  boxShadow: gameMode === 'offline' ? '0 0 20px var(--crew-glow)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '2rem' }}>📶</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: gameMode === 'offline' ? 'var(--crew-light)' : 'var(--text-primary)' }}>Offline Wi-Fi</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>10-15 Players on Local Wi-Fi / Hotspot (No Internet)</div>
                {gameMode === 'offline' && <div style={{ fontSize: '0.7rem', color: 'var(--crew-light)', fontWeight: 600 }}>✓ Selected</div>}
              </button>

              {/* Online Mode Card */}
              <button
                onClick={() => setGameMode('online')}
                style={{
                  padding: '18px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${gameMode === 'online' ? '#3b82f6' : 'var(--border-subtle)'}`,
                  background: gameMode === 'online' ? 'rgba(59,130,246,0.12)' : 'var(--card-bg)',
                  boxShadow: gameMode === 'online' ? '0 0 20px rgba(59,130,246,0.3)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '2rem' }}>🌐</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: gameMode === 'online' ? '#93c5fd' : 'var(--text-primary)' }}>Online Cloud</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Players use their own mobile 4G/5G data</div>
                {gameMode === 'online' && <div style={{ fontSize: '0.7rem', color: '#93c5fd', fontWeight: 600 }}>✓ Selected</div>}
              </button>
            </div>

            {/* Mode Info Banner */}
            <div style={{
              marginTop: '10px',
              padding: '10px 14px',
              background: gameMode === 'offline' ? 'rgba(124,58,237,0.08)' : 'rgba(59,130,246,0.08)',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${gameMode === 'offline' ? 'rgba(124,58,237,0.25)' : 'rgba(59,130,246,0.25)'}`,
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              {gameMode === 'offline' ? (
                <>📶 <strong style={{ color: 'var(--text-secondary)' }}>Local Wi-Fi mode:</strong> Support 10–15 player devices on local router or mobile hotspot. Each player connects to their own Bluetooth headphones.</>
              ) : (
                <>🌐 <strong style={{ color: 'var(--text-secondary)' }}>Online mode:</strong> Players join from anywhere using the Vercel link. Each player can use their own mobile data or any Wi-Fi.</>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input
              className="input"
              type="text"
              placeholder="Your name (e.g. Host)"
              value={hostName}
              onChange={(e) => setHostName(e.target.value.slice(0, 20))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hostName.trim() && !creating) createRoom();
              }}
              autoFocus
            />

            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={createRoom}
              disabled={!hostName.trim() || creating}
            >
              {creating ? (
                <>
                  <span
                    className="animate-spin"
                    style={{
                      display: 'inline-block',
                      width: '18px',
                      height: '18px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      marginRight: '8px',
                    }}
                  />
                  <span>Creating Room...</span>
                </>
              ) : (
                `🚀 Create Room (${gameMode === 'offline' ? '📶 Local Wi-Fi' : '🌐 Online'})`
              )}
            </button>

            <button className="btn btn-ghost btn-full" onClick={() => router.push('/')}>
              ← Back
            </button>
          </div>
        </div>

        {/* Toast inside pre-room */}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="page-container-wide" style={{ gap: '20px', paddingBottom: '40px' }}>
      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className="logo-text">🎵 Find the Imposter — Wi-Fi Audio Controller</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`status-dot ${connected ? 'status-dot-green' : 'status-dot-red'}`} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {connected ? (gameMode === 'offline' ? '📶 Local Wi-Fi Active' : '🌐 Online') : 'Offline'}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={endGame} style={{ color: 'var(--imposter-light)' }}>
          End Session
        </button>
      </div>

      {/* ── Room Code & Multi-Device Summary Banner ── */}
      <div
        className="card"
        style={{ padding: '20px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div className="section-label" style={{ marginBottom: '6px' }}>
            Room Code
          </div>
          <div className="room-code">{roomCode}</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              👥 Players: <strong style={{ color: 'var(--crew-light)' }}>{totalCount} / {maxPlayers}</strong>
            </span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              🎧 Headphones: <strong style={{ color: '#10b981' }}>{btConnectedCount} / {connectedCount}</strong>
            </span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              🎵 Audio Ready: <strong style={{ color: '#10b981' }}>{audioReadyCount} / {connectedCount}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyRoomCode}>
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowQR(!showQR)}>
            📷 {showQR ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
        {showQR && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <QRCode text={joinUrl} size={160} />
            <div>
              <div className="section-label" style={{ marginBottom: '6px' }}>
                Share this link
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'var(--crew-light)',
                  wordBreak: 'break-all',
                }}
              >
                {joinUrl}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>
                Players scan QR or visit the link, then enter code:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{roomCode}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Imposter Reveal Banner ── */}
      {imposterRevealed && (
        <div className="card card-imposter animate-slide-up" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🕵️</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--imposter-light)' }}>
            {imposterRevealed.join(', ')} {imposterRevealed.length === 1 ? 'was' : 'were'} the Imposter!
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* ── Left Column: Players + Roles ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Players */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="section-label">Players ({totalCount})</span>
              <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
            </div>
            <PlayerList
              players={players}
              showRoles={hasRoles}
              onMakeCrew={(id) => assignRole(id, 'CREW')}
              onMakeImposter={(id) => assignRole(id, 'IMPOSTER')}
              onKick={kickPlayer}
            />
          </div>

          {/* Role Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span className="section-label">Role Controls</span>
              <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
            </div>
            <button className="btn btn-primary btn-full" onClick={randomizeRoles} disabled={players.length < 2}>
              🎲 Randomize Roles
            </button>
            {(state === 'NEXT_ROUND' || state === 'ROUND_COMPLETE') && (
              <button
                className="btn btn-ghost btn-full"
                onClick={randomizeNextImposter}
                disabled={players.length < 2}
              >
                🔄 Random New Imposter
              </button>
            )}
          </div>

          {/* Game Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span className="section-label">Game Controls</span>
              <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
            </div>

            {(state === 'READY_CHECK' || state === 'NEXT_ROUND') && hasRoles && (
              <button
                className="btn btn-success btn-full btn-lg"
                onClick={startRound}
                disabled={!allReady}
                title={!allReady ? 'Waiting for all players to be ready' : ''}
              >
                {allReady
                  ? '🚀 Start Round'
                  : `⏳ Waiting (${players.filter((p) => p.isReady && p.isConnected).length}/${players.filter((p) => p.isConnected).length} ready)`}
              </button>
            )}

            {state === 'PLAYING' && (
              <button className="btn btn-danger btn-full" onClick={endRound}>
                🏁 End Round & Reveal
              </button>
            )}

            {state === 'ROUND_COMPLETE' && (
              <button className="btn btn-primary btn-full" onClick={nextRound}>
                ⏭ Next Round
              </button>
            )}

            {/* Game state indicator */}
            <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
              <span className="section-label">Game State: </span>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    state === 'PLAYING'
                      ? 'var(--accent-green)'
                      : state === 'ROUND_COMPLETE'
                      ? 'var(--accent-gold)'
                      : 'var(--text-secondary)',
                }}
              >
                {state || 'LOBBY'}
              </span>
              {' · '}
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Round {roomState?.round || 1}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right Column: Song Controls ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="section-label">Song Controls</span>
            <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
          </div>

          <SongControl
            role="CREW"
            videoId={roomState?.crewVideoId}
            isPlaying={crewPlaying}
            currentPosition={crewPosition}
            duration={crewDuration}
            onLoad={(url) => handleLoadSong('CREW', url)}
            onPlay={() => handlePlay('CREW')}
            onPause={() => handlePause('CREW')}
            onStop={() => handleStop('CREW')}
            onRestart={() => {
              handleStop('CREW');
              setTimeout(() => handlePlay('CREW'), 200);
            }}
            onSeek={(pos) => handleSeek('CREW', pos)}
          />

          <SongControl
            role="IMPOSTER"
            videoId={roomState?.imposterVideoId}
            isPlaying={imposterPlaying}
            currentPosition={imposterPosition}
            duration={imposterDuration}
            onLoad={(url) => handleLoadSong('IMPOSTER', url)}
            onPlay={() => handlePlay('IMPOSTER')}
            onPause={() => handlePause('IMPOSTER')}
            onStop={() => handleStop('IMPOSTER')}
            onRestart={() => {
              handleStop('IMPOSTER');
              setTimeout(() => handlePlay('IMPOSTER'), 200);
            }}
            onSeek={(pos) => handleSeek('IMPOSTER', pos)}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
