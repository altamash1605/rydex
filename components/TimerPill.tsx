'use client';

import { useEffect, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type StatsEventDetail = {
  phase: RidePhase;
  idleSec?: number;
  pickupSec?: number;
  rideSec?: number;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatMinutes(seconds?: number) {
  if (seconds == null || seconds < 0) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${pad2(minutes)}m`;
}

/**
 * Pill-shaped timer overlay:
 *  - IDLE: 01m
 *  - PICKUP: 01m
 *  - RIDE IN PROGRESS: 01m
 *
 * Reads from the existing `rydex-ride-stats` CustomEvent.
 * Purely additive; doesn't modify any other project logic.
 */
export default function TimerPill() {
  const [phase, setPhase] = useState<RidePhase>('idle');
  const [idleSec, setIdleSec] = useState(0);
  const [pickupSec, setPickupSec] = useState(0);
  const [rideSec, setRideSec] = useState(0);

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
    return () => window.removeEventListener('rydex-ride-stats', onStats as EventListener);
  }, []);

  let label = 'IDLE';
  let value = formatMinutes(idleSec);

  if (phase === 'toPickup') {
    label = 'PICKUP';
    value = formatMinutes(pickupSec);
  } else if (phase === 'riding') {
    label = 'RIDE IN PROGRESS';
    value = formatMinutes(rideSec);
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
