'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { getOrCreateSessionId, saveRoomSession } from '@/lib/session';
import Link from 'next/link';

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Eagerly initiate socket connection when page mounts
  useEffect(() => {
    connectSocket();
  }, []);

  const handleJoin = () => {
    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim();
    if (code.length !== 6) return setError('Room code must be 6 characters.');
    if (!name) return setError('Please enter your name.');
    if (name.length > 20) return setError('Name must be 20 characters or less.');

    setError('');
    setLoading(true);

    const socket = connectSocket();
    const sessionId = getOrCreateSessionId();

    let timeoutId: NodeJS.Timeout | null = null;

    const doJoin = () => {
      // 5-second timeout safeguard in case socket response is delayed
      timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Connection timed out. Check your Wi-Fi and try again.');
      }, 6000);

      socket.emit(
        'join_room',
        { roomCode: code, playerName: name, sessionId },
        (res: { success: boolean; error?: string; sessionId?: string }) => {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);

          if (res.success) {
            saveRoomSession(code, name, false);
            router.push(`/player?room=${code}&name=${encodeURIComponent(name)}`);
          } else {
            const msgs: Record<string, string> = {
              ROOM_NOT_FOUND: 'Room not found. Check the code and try again.',
              ROOM_FULL: 'This room is full (15 players max).',
              DUPLICATE_NAME: 'That name is already taken. Choose another.',
              GAME_IN_PROGRESS: 'The game has already started.',
              GAME_OVER: 'This game has ended.',
            };
            setError(msgs[res.error || ''] || 'Could not join. Try again.');
          }
        }
      );
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.connect();
      const onConnect = () => {
        socket.off('connect', onConnect);
        doJoin();
      };
      socket.on('connect', onConnect);

      // Fallback timeout if socket cannot connect at all
      setTimeout(() => {
        if (!socket.connected) {
          socket.off('connect', onConnect);
          setLoading(false);
          setError('Could not connect to game server. Check Wi-Fi connection.');
        }
      }, 5000);
    }
  };

  return (
    <div className="page-container" style={{ paddingTop: '40px', gap: '0' }}>
      <div className="animate-fade-in" style={{ width: '100%' }}>
        {/* Back */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
            textDecoration: 'none',
            marginBottom: '32px',
          }}
        >
          ← Back
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📱</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '6px' }}>Join Game</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Enter the room code from the Game Master
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* Room Code */}
          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: '8px' }}>
              Room Code
            </label>
            <input
              className={`input ${error && !roomCode ? 'input-error' : ''}`}
              type="text"
              placeholder="e.g. X7K92P"
              value={roomCode}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                setRoomCode(val);
                setError('');
              }}
              style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.2em' }}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
            />
          </div>

          {/* Player Name */}
          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: '8px' }}>
              Your Name
            </label>
            <input
              className="input"
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value.slice(0, 20));
                setError('');
              }}
              autoComplete="off"
              maxLength={20}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--imposter-light)',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Join Button */}
          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading || roomCode.length !== 6 || !playerName.trim()}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
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
                  }}
                />
                <span>Joining...</span>
              </>
            ) : (
              <>🚀 Join Game</>
            )}
          </button>
        </form>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '32px', textAlign: 'center', lineHeight: 1.6 }}>
          The Game Master will see you join in real time.<br />
          You'll receive your secret role shortly after.
        </p>
      </div>
    </div>
  );
}
