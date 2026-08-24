'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  size?: number;
}

export default function QRCode({ text, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!text || !canvasRef.current) return;

    // Dynamically import qrcode library
    import('qrcode').then((QRCodeLib) => {
      QRCodeLib.toCanvas(canvasRef.current!, text, {
        width: size,
        margin: 2,
        color: { dark: '#1a0a3a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }, (err) => {
        if (err) {
          console.error('QR generation error:', err);
          setError(true);
        }
      });
    }).catch(() => setError(true));
  }, [text, size]);

  if (error) {
    return (
      <div style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px',
      }}>
        QR unavailable.<br />Share room code manually.
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 'var(--radius-md)',
      padding: '12px',
      display: 'inline-block',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
