'use client';
import { PublicPlayer, PlayerRole } from '@/types/game';

interface Props {
  players: PublicPlayer[];
  showRoles?: boolean;
  onMakeCrew?: (playerId: string) => void;
  onMakeImposter?: (playerId: string) => void;
  onKick?: (playerId: string) => void;
}

export default function PlayerList({
  players,
  showRoles = false,
  onMakeCrew,
  onMakeImposter,
  onKick,
}: Props) {
  if (players.length === 0) {
    return (
      <div style={{
        padding: '32px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '0.9rem',
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
        Waiting for players to join...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {players.map((player, idx) => {
        const isBtConnected = player.bluetoothConnected ?? true; // default true if reported or detected
        const audioStatus = player.audioStatus || (player.isReady ? 'ready' : 'idle');

        return (
          <div
            key={player.id}
            className="card animate-fade-in"
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              animationDelay: `${idx * 0.04}s`,
              animationFillMode: 'both',
              flexWrap: 'wrap',
            }}
          >
            {/* Connection dot */}
            <div
              className={`status-dot ${player.isConnected ? 'status-dot-green' : 'status-dot-red'}`}
              title={player.isConnected ? 'Wi-Fi Connected' : 'Wi-Fi Disconnected'}
            />

            {/* Name + Status Detail */}
            <div style={{ flex: 1, minWidth: '120px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.name}
                </span>
                {player.batteryLevel !== undefined && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title={`Battery: ${player.batteryLevel}%`}>
                    🔋 {player.batteryLevel}%
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                {!player.isConnected ? (
                  <span style={{ color: 'var(--imposter-light)', fontSize: '0.73rem', fontWeight: 600 }}>🔴 Disconnected</span>
                ) : (
                  <>
                    <span style={{ fontSize: '0.73rem', color: isBtConnected ? 'var(--accent-green)' : 'var(--text-muted)' }} title="Bluetooth Headphone Status">
                      🎧 {isBtConnected ? 'Headphone Connected' : 'No Headphone'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Audio Readiness status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {audioStatus === 'ready' && (
                <span style={{
                  padding: '3px 9px',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '999px',
                  color: '#10b981',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>🎵 AUDIO READY</span>
              )}
              {audioStatus === 'downloading' && (
                <span style={{
                  padding: '3px 9px',
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '999px',
                  color: '#f59e0b',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>⏳ DOWNLOADING</span>
              )}
              {audioStatus === 'failed' && (
                <span style={{
                  padding: '3px 9px',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '999px',
                  color: '#ef4444',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>⚠️ FAILED</span>
              )}

              {/* Ready badge */}
              {player.isReady && audioStatus !== 'ready' && (
                <span style={{
                  padding: '3px 9px',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '999px',
                  color: '#10b981',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>✓ READY</span>
              )}
            </div>

            {/* Role badge */}
            {showRoles && player.role && (
              <span className={`role-badge ${player.role === 'CREW' ? 'role-badge-crew' : 'role-badge-imposter'}`}>
                {player.role === 'CREW' ? '👥' : '🕵️'} {player.role}
              </span>
            )}

            {/* Host controls */}
            {showRoles && (onMakeCrew || onMakeImposter) && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {onMakeCrew && player.role !== 'CREW' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onMakeCrew(player.id)}
                    title="Make Crew"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  >
                    👥
                  </button>
                )}
                {onMakeImposter && player.role !== 'IMPOSTER' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onMakeImposter(player.id)}
                    title="Make Imposter"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  >
                    🕵️
                  </button>
                )}
                {onKick && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onKick(player.id)}
                    title="Kick player"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--imposter-light)' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
