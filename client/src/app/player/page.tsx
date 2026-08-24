import type { Metadata } from 'next';
import { Suspense } from 'react';
import PlayerDashboard from '@/components/PlayerDashboard';

export const metadata: Metadata = {
  title: 'Player — Find the Imposter',
  description: 'Listen carefully and find the imposter!',
};

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    }>
      <PlayerDashboard />
    </Suspense>
  );
}
