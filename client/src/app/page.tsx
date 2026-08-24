'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="page-container" style={{ justifyContent: 'center', gap: '0' }}>
      {/* Background particles */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {mounted && Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${Math.random() * 4 + 2}px`,
            height: `${Math.random() * 4 + 2}px`,
            borderRadius: '50%',
            background: i % 2 === 0 ? 'rgba(124,58,237,0.4)' : 'rgba(239,68,68,0.3)',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `pulse-green ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }} />
        ))}
      </div>

      <div className="animate-fade-in" style={{ width: '100%', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{
          fontSize: '5rem',
          marginBottom: '16px',
          filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.5))',
          animation: 'glow-crew 3s ease-in-out infinite',
        }}>
          🎵
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(2rem, 8vw, 2.8rem)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          marginBottom: '8px',
        }}>
          <span style={{ background: 'linear-gradient(135deg, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Find the
          </span>
          <br />
          <span style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Imposter
          </span>
        </h1>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '48px', lineHeight: 1.5 }}>
          A multiplayer song game.<br />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Can you spot who's hearing a different song?</span>
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
          <Link href="/host" className="btn btn-primary btn-lg btn-full animate-slide-up delay-100"
            style={{ fontSize: '1.1rem', letterSpacing: '0.02em' }}>
            <span>🎮</span>
            <span>Create Game</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.8rem' }}>Game Master</span>
          </Link>

          <Link href="/join" className="btn btn-ghost btn-lg btn-full animate-slide-up delay-200"
            style={{ fontSize: '1.1rem' }}>
            <span>📱</span>
            <span>Join Game</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.8rem' }}>Player</span>
          </Link>
        </div>

        {/* Footer note */}
        <p className="animate-slide-up delay-300" style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '40px', lineHeight: 1.6 }}>
          2–15 players · No accounts needed · Play on any device
        </p>
      </div>
    </div>
  );
}
