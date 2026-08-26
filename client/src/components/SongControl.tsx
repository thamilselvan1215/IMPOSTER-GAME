'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { PlayerRole } from '@/types/game';
import { extractVideoId, isValidVideoId, buildThumbnailUrl } from '@/lib/youtube';

interface Props {
  role: PlayerRole;
  videoId?: string;
  isPlaying: boolean;
  currentPosition?: number;   // seconds, polled from server
  duration?: number;           // seconds, set after load
  onLoad: (url: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSeek: (position: number) => void;
  disabled?: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SongControl({
  role,
  videoId,
  isPlaying,
  currentPosition = 0,
  duration = 0,
  onLoad,
  onPlay,
  onPause,
  onStop,
  onRestart,
  onSeek,
  disabled = false,
}: Props) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  // Local elapsed counter so slider animates smoothly between server ticks
  const [localPos, setLocalPos] = useState(currentPosition);
  const localPosRef = useRef(localPos);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  const isCrew = role === 'CREW';
  const color = isCrew ? 'var(--crew-primary)' : 'var(--imposter-primary)';
  const colorGlow = isCrew ? 'var(--crew-glow)' : 'var(--imposter-glow)';
  const colorLight = isCrew ? 'var(--crew-light)' : 'var(--imposter-light)';
  const cardClass = isCrew ? 'card card-crew' : 'card card-imposter';

  // Sync localPos with server position when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos(currentPosition);
      localPosRef.current = currentPosition;
      lastTickRef.current = Date.now();
    }
  }, [currentPosition, isDragging]);

  // Smoothly increment localPos while playing
  const tick = useCallback(() => {
    if (!isPlaying || isDragging) return;
    const now = Date.now();
    const elapsed = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    const next = Math.min(localPosRef.current + elapsed, duration || Infinity);
    localPosRef.current = next;
    setLocalPos(next);
    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying, isDragging, duration]);

  useEffect(() => {
    if (isPlaying && !isDragging) {
      lastTickRef.current = Date.now();
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, isDragging, tick]);

  const handleLoad = () => {
    const id = extractVideoId(url);
    if (!isValidVideoId(id)) {
      setUrlError('Invalid YouTube URL. Supported: youtube.com/watch?v=, youtu.be/, embed/');
      return;
    }
    setUrlError('');
    onLoad(url);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setDragValue(val);
    setLocalPos(val);
    localPosRef.current = val;
  };

  const handleSliderCommit = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(false);
    onSeek(dragValue);
    lastTickRef.current = Date.now();
  };

  const displayPos = isDragging ? dragValue : localPos;
  const sliderMax = duration > 0 ? duration : Math.max(displayPos, 100);
  const rawPercent = sliderMax > 0 ? (displayPos / sliderMax) * 100 : 0;
  const sliderPercent = Math.min(100, Math.max(0, rawPercent));

  return (
    <div className={cardClass} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '1.5rem' }}>{isCrew ? '👥' : '🕵️'}</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: colorLight }}>{isCrew ? 'CREW SONG' : 'IMPOSTER SONG'}</div>
          {videoId && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{videoId}</div>}
        </div>
        {videoId && (
          <div style={{ marginLeft: 'auto' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isPlaying ? '#10b981' : 'var(--text-muted)',
              boxShadow: isPlaying ? '0 0 8px rgba(16,185,129,0.8)' : 'none',
              transition: 'all 0.3s',
            }} />
          </div>
        )}
      </div>

      {/* Thumbnail */}
      {videoId && (
        <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', aspectRatio: '16/5', background: 'rgba(0,0,0,0.3)' }}>
          <img
            src={buildThumbnailUrl(videoId)}
            alt="Video thumbnail"
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* ── Seek Timeline ── */}
      {videoId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
          {/* Slider track */}
          <div style={{
            position: 'relative',
            height: '20px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            overflow: 'hidden',
            padding: '0 6px',
          }}>
            {/* Track background */}
            <div style={{
              position: 'absolute', left: '6px', right: '6px', top: '50%', transform: 'translateY(-50%)',
              height: '4px',
              background: 'rgba(255,255,255,0.08)', borderRadius: '2px',
              pointerEvents: 'none',
            }} />
            {/* Filled track */}
            <div style={{
              position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)',
              height: '4px', width: `calc(${sliderPercent}% - 12px * (${sliderPercent} / 100))`,
              background: `linear-gradient(90deg, ${color}, ${colorLight})`,
              borderRadius: '2px',
              transition: isDragging ? 'none' : 'width 0.1s linear',
              maxWidth: 'calc(100% - 12px)',
              pointerEvents: 'none',
            }} />
            {/* Native range input (transparent, sits on top) */}
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={0.5}
              value={displayPos}
              disabled={disabled || !videoId}
              onChange={handleSliderChange}
              onMouseDown={() => { setIsDragging(true); setDragValue(displayPos); }}
              onTouchStart={() => { setIsDragging(true); setDragValue(displayPos); }}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: 0, cursor: videoId ? 'pointer' : 'default',
                zIndex: 2, margin: 0, padding: 0,
                boxSizing: 'border-box',
              }}
            />
            {/* Thumb dot */}
            <div style={{
              position: 'absolute', top: '50%', left: `calc(6px + (${sliderPercent}% * 0.94))`,
              transform: 'translate(-50%, -50%)',
              width: isDragging ? '16px' : '12px',
              height: isDragging ? '16px' : '12px',
              borderRadius: '50%',
              background: colorLight,
              boxShadow: `0 0 ${isDragging ? 12 : 6}px ${colorGlow}`,
              transition: isDragging ? 'none' : 'all 0.1s, left 0.1s linear',
              pointerEvents: 'none',
              zIndex: 1,
            }} />
          </div>
          {/* Time labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            <span style={{ color: isDragging ? colorLight : 'var(--text-muted)', fontWeight: isDragging ? 700 : 400 }}>
              {formatTime(displayPos)}
            </span>
            <span>{duration > 0 ? formatTime(duration) : formatTime(sliderMax)}</span>
          </div>
        </div>
      )}

      {/* URL Input */}
      <div>
        <label className="section-label" style={{ display: 'block', marginBottom: '6px' }}>YouTube URL</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className={`input ${urlError ? 'input-error' : ''}`}
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => { setUrl(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            style={{ fontSize: '0.85rem', flex: 1 }}
          />
          <button
            className="btn btn-ghost"
            onClick={handleLoad}
            disabled={!url.trim()}
            style={{ flexShrink: 0, borderColor: color, color: colorLight }}
          >
            LOAD
          </button>
        </div>
        {urlError && (
          <p style={{ color: 'var(--imposter-light)', fontSize: '0.78rem', marginTop: '6px' }}>{urlError}</p>
        )}
      </div>

      {/* Playback Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
        <button
          className="btn"
          onClick={onPlay}
          disabled={disabled || !videoId || isPlaying}
          style={{
            background: `linear-gradient(135deg, ${color}, ${isCrew ? '#5b21b6' : '#b91c1c'})`,
            color: 'white',
            boxShadow: videoId && !isPlaying ? `0 4px 16px ${colorGlow}` : 'none',
            fontSize: '1.1rem',
          }}
          title="Play"
        >
          ▶
        </button>
        <button
          className="btn btn-ghost"
          onClick={onPause}
          disabled={disabled || !videoId || !isPlaying}
          style={{ fontSize: '1.1rem', borderColor: color, color: colorLight }}
          title="Pause"
        >
          ⏸
        </button>
        <button
          className="btn btn-ghost"
          onClick={onStop}
          disabled={disabled || !videoId}
          style={{ fontSize: '1rem' }}
          title="Stop"
        >
          ■
        </button>
        <button
          className="btn btn-ghost"
          onClick={onRestart}
          disabled={disabled || !videoId}
          style={{ fontSize: '1rem' }}
          title="Restart from beginning"
        >
          ↺
        </button>
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        Drag the timeline to seek · Controls send commands to {isCrew ? 'Crew' : 'Imposter'} players only
      </p>
    </div>
  );
}
