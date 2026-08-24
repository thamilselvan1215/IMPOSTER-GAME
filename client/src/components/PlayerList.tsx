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
      {players.map((player, idx) => (
        <div
          key={player.id}
          className={`card animate-fade-in`}
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animationDelay: `${idx * 0.04}s`,
            animationFillMode: 'both',
          }}
        >
          {/* Connection dot */}
          <div className={`status-dot ${player.isConnected ? 'status-dot-green' : 'status-dot-red'}`} />

          {/* Name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.name}
            </span>
            {!player.isConnected && (
              <span style={{ color: 'var(--imposter-light)', fontSize: '0.75rem' }}>Disconnected</span>
            )}
          </div>

          {/* Ready badge */}
          {player.isReady && (
            <span style={{
              padding: '2px 10px',
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '999px',
              color: '#10b981',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}>✓ READY</span>
          )}

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
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  👥
                </button>
              )}
              {onMakeImposter && player.role !== 'IMPOSTER' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onMakeImposter(player.id)}
                  title="Make Imposter"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
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
      ))}
    </div>
  );
}
