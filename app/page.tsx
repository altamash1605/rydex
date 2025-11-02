'use client';

import dynamic from 'next/dynamic';
import RideController from '@/components/RideController';

// Dynamically import MapView to prevent SSR issues with Leaflet
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <MapView />
      <RideController />
    </main>
  );
}
