'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { getOrCreateSessionId, saveRoomSession } from '@/lib/session';
import Link from 'next/link';

function JoinForm() {
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-fill room code from URL params if present (e.g. from QR code scan ?code=XXXXXX or ?room=XXXXXX)
  useEffect(() => {
    const codeParam = searchParams.get('code') || searchParams.get('room');
    if (codeParam) {
      const clean = codeParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      setRoomCode(clean);
    }
  }, [searchParams]);

  // Eagerly initiate socket connection when page mounts
  useEffect(() => {
    connectSocket();
  }, []);

  const handleJoin = () => {
    if (loading) return;

    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim();

    if (!code) {
      setError('Please enter the 6-character room code.');
      return;
    }
    if (code.length !== 6) {
      setError(`Room code must be 6 characters (you entered ${code.length}).`);
      return;
    }
    if (!name) {
      setError('Please enter your name.');
      return;
    }
    if (name.length > 20) {
      setError('Name must be 20 characters or less.');
      return;
    }

    setError('');
    setLoading(true);

    const socket = connectSocket();
    const sessionId = getOrCreateSessionId();

    let timeoutId: NodeJS.Timeout | null = null;

    const doJoin = () => {
      timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Connection timed out. Check your Wi-Fi network and try again.');
      }, 6000);

      socket.emit(
        'join_room',
        { roomCode: code, playerName: name, sessionId },
        (res: { success: boolean; error?: string; sessionId?: string }) => {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);

          if (res?.success) {
            saveRoomSession(code, name, false);
            // Hard window navigation for 100% reliable mobile browser redirect
            window.location.href = `/player?room=${code}&name=${encodeURIComponent(name)}`;
          } else {
            const msgs: Record<string, string> = {
              ROOM_NOT_FOUND: `Room "${code}" not found. Create a new room on the laptop screen first.`,
              ROOM_FULL: 'This room is full (15 players max).',
              DUPLICATE_NAME: 'That name is already taken in this room. Choose another.',
              GAME_IN_PROGRESS: 'The game has already started.',
              GAME_OVER: 'This game has ended.',
            };
            setError(msgs[res?.error || ''] || 'Could not join room. Try again.');
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

        {/* Form Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoin();
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoin();
              }}
              autoComplete="off"
              maxLength={20}
            />
          </div>

          {/* Error message box */}
          {error && (
            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--imposter-light)',
                fontSize: '0.9rem',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Join Button */}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-full"
            onClick={handleJoin}
            disabled={loading}
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
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '32px', textAlign: 'center', lineHeight: 1.6 }}>
          The Game Master will see you join in real time.<br />
          You'll receive your secret role shortly after.
        </p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', paddingTop: '40px', color: 'var(--text-muted)' }}>Loading...</div>}>
      <JoinForm />
    </Suspense>
  );
}
