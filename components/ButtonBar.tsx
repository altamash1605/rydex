'use client';

import { useEffect, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

interface RideStats {
  phase?: RidePhase;
  idle?: boolean;
  idleSec?: number;
  pickupSec?: number;
  rideSec?: number;
}

export default function ButtonBar() {
  const [phase, setPhase] = useState<RidePhase>('idle');

  // 🔹 Listen for ride phase updates from RideController
  useEffect(() => {
    const onStats = (e: Event) => {
      const ce = e as CustomEvent<RideStats>;
      if (ce.detail?.phase) setPhase(ce.detail.phase);
    };
    window.addEventListener('rydex-ride-stats', onStats as EventListener);
    return () => window.removeEventListener('rydex-ride-stats', onStats as EventListener);
  }, []);

  // 🔹 Dispatchers for RideController events
  const goToPickup = () => window.dispatchEvent(new Event('rydex-pickup-start'));
  const abortPickup = () => window.dispatchEvent(new Event('rydex-pickup-abort'));
  const startRide = () => window.dispatchEvent(new Event('rydex-ride-start'));
  const endRide = () => window.dispatchEvent(new Event('rydex-ride-end'));

  // 🔹 Derive button labels and handlers
  let primaryLabel = '';
  let secondaryLabel = '';
  let onPrimary: (() => void) | undefined;
  let onSecondary: (() => void) | undefined;

  if (phase === 'idle') {
    primaryLabel = 'Go to Pickup';
    onPrimary = goToPickup;
  } else if (phase === 'toPickup') {
    primaryLabel = 'Start Ride';
    secondaryLabel = 'Abort';
    onPrimary = startRide;
    onSecondary = abortPickup;
  } else if (phase === 'riding') {
    primaryLabel = 'End Ride';
    onPrimary = endRide;
  }

  return (
    <div className="absolute top-4 inset-x-0 px-4 z-20">
      <div className="mx-auto max-w-sm flex items-center justify-center gap-3">
        {primaryLabel && (
          <button
            className="flex-1 rounded-lg bg-black text-white py-3 text-sm font-medium shadow-md"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
        )}
        {secondaryLabel && (
          <button
            className="flex-1 rounded-lg bg-red-200 text-gray-900 py-3 text-sm font-medium shadow-md border border-gray-300"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
