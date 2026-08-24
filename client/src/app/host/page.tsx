import type { Metadata } from 'next';
import HostDashboard from '@/components/HostDashboard';

export const metadata: Metadata = {
  title: 'Game Master — Find the Imposter',
  description: 'Control the game as the Game Master',
};

export default function HostPage() {
  return <HostDashboard />;
}
