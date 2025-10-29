// app/page.tsx
'use client';

import MapView from '@/components/MapView';
import ButtonBar from '@/components/ButtonBar';
import SpeedHUD from '@/components/SpeedHUD';
import RideController from '@/components/RideController'; // ← ensure this exact path/case

export default function Home() {
  return (
    <main className="relative h-screen w-screen">
      <div className="absolute inset-0 z-0">
        <MapView />
      </div>

      <ButtonBar
        primaryLabel="Start Ride"
        secondaryLabel="End Ride"
        onPrimary={() => window.dispatchEvent(new Event('rydex-ride-start'))}
        onSecondary={() => window.dispatchEvent(new Event('rydex-ride-end'))}
      />

      <SpeedHUD />
      <RideController />   {/* ← must be present */}
    </main>
  );
}
