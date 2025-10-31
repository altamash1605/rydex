// app/page.tsx
'use client';

import dynamic from 'next/dynamic';
import ButtonBar from '@/components/ButtonBar';
import SpeedHUD from '@/components/SpeedHUD';
import RideController from '@/components/RideController';

// 👇 dynamically import MapView so Leaflet never runs on the server
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  return (
    <main className="relative h-screen w-screen">
      {/* Map layer */}
      <div className="absolute inset-0 z-0">
        <MapView />
      </div>

      {/* Ride control buttons */}
      <ButtonBar />

      {/* Live speed display */}
      <SpeedHUD />

      {/* Core ride logic and events */}
      <RideController />
    </main>
  );
}
