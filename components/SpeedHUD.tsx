'use client';

import { useEffect, useState } from 'react';

/** Keep this local to avoid touching other files */
type RidePhase = 'idle' | 'toPickup' | 'riding';

type StatsEventDetail = {
  phase: RidePhase;
  idleSec?: number;    // cumulative seconds spent idle
  pickupSec?: number;  // cumulative seconds spent in pickup
  rideSec?: number;    // cumulative seconds spent riding
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatMinutesLabel(seconds?: number) {
  if (seconds == null || seconds < 0) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${pad2(minutes)}m`;
}

/**
 * Renders a pill-shaped timer that shows:
 * - IDLE: 01m     (phase === 'idle')
 * - PICKUP: 01m   (phase === 'toPickup')
 * - RIDE IN PROGRESS: 01m  (phase === 'riding')
 *
 * Data comes from the `rydex-ride-stats` CustomEvent dispatched elsewhere.
 * We only read and display; no other project code is modified.
 */
export default function SpeedHUD() {
  const [phase, setPhase] = useState<RidePhase>('idle');
  const [idleSec, setIdleSec] = useState<number>(0);
  const [pickupSec, setPickupSec] = useState<number>(0);
  const [rideSec, setRideSec] = useState<number>(0);

  useEffect(() => {
    const onStats = (e: Event) => {
      const detail = (e as CustomEvent<StatsEventDetail>).detail;
      if (!detail) return;
      if (detail.phase) setPhase(detail.phase);
      if (typeof detail.idleSec === 'number') setIdleSec(detail.idleSec);
      if (typeof detail.pickupSec === 'number') setPickupSec(detail.pickupSec);
      if (typeof detail.rideSec === 'number') setRideSec(detail.rideSec);
    };

    window.addEventListener('rydex-ride-stats', onStats as EventListener);
    return () => {
      window.removeEventListener('rydex-ride-stats', onStats as EventListener);
    };
  }, []);

  let label = 'IDLE';
  let value = formatMinutesLabel(idleSec);

  if (phase === 'toPickup') {
    label = 'PICKUP';
    value = formatMinutesLabel(pickupSec);
  } else if (phase === 'riding') {
    label = 'RIDE IN PROGRESS';
    value = formatMinutesLabel(rideSec);
  }

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[1000] -translate-x-1/2"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="inline-flex items-center gap-2 rounded-full bg-black/80 px-4 py-1 text-white shadow-lg backdrop-blur">
        <span className="text-xs font-semibold tracking-wide">{label}</span>
        <span className="text-sm font-bold tabular-nums">{value}</span>
      </div>
    </div>
  );
}
