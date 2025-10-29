// app/page.tsx
'use client';

import MapView from '@/components/MapView';
import ButtonBar from '@/components/ButtonBar';
import SpeedHUD from '@/components/SpeedHUD';
import RideController from '@/components/RideController'; // ← ensure this exact path/case

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
