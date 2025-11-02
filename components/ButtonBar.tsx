'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type ButtonState = {
  label: string;
  event: 'rydex-pickup-start' | 'rydex-ride-start' | 'rydex-ride-end';
};

type RideStats = {
  phase: RidePhase;
  idleSec: number;
  pickupSec: number;
  rideSec: number;
  distanceM: number;
};

const initialStats: RideStats = {
  phase: 'idle',
  idleSec: 0,
  pickupSec: 0,
  rideSec: 0,
  distanceM: 0,
};

function formatDuration(secs: number) {
  const minutes = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatDistance(distanceM: number) {
  const km = distanceM / 1000;
  if (!km) return '0.00 km';
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export default function ButtonBar() {
  const [stats, setStats] = useState<RideStats>(initialStats);

  useEffect(() => {
    const handleStats: EventListener = (event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;
      setStats((prev) => ({
        phase: detail.phase ?? prev.phase,
        idleSec: detail.idleSec ?? prev.idleSec,
        pickupSec: detail.pickupSec ?? prev.pickupSec,
        rideSec: detail.rideSec ?? prev.rideSec,
        distanceM: detail.distanceM ?? prev.distanceM,
      }));
    };

    window.addEventListener('rydex-ride-stats', handleStats);
    return () => {
      window.removeEventListener('rydex-ride-stats', handleStats);
    };
  }, []);

  const config = useMemo<ButtonState>(() => {
    switch (stats.phase) {
      case 'toPickup':
        return { label: 'Start Ride', event: 'rydex-ride-start' };
      case 'riding':
        return { label: 'End Ride', event: 'rydex-ride-end' };
      default:
        return { label: 'Go to Pickup', event: 'rydex-pickup-start' };
    }
  }, [stats.phase]);

  const handlePrimaryAction = useCallback(() => {
    window.dispatchEvent(new Event(config.event));
  }, [config.event]);

  const phaseLabel = useMemo(() => {
    switch (stats.phase) {
      case 'toPickup':
        return 'Heading to pickup';
      case 'riding':
        return 'Ride in progress';
      default:
        return 'Idle & ready';
    }
  }, [stats.phase]);

  const phaseHint = useMemo(() => {
    switch (stats.phase) {
      case 'toPickup':
        return 'Navigate to your rider and confirm arrival.';
      case 'riding':
        return 'Track the trip and end when you reach the drop-off.';
      default:
        return 'Start the pickup once you have a rider assignment.';
    }
  }, [stats.phase]);

  const activeDuration = stats.phase === 'riding' ? stats.rideSec : stats.phase === 'toPickup' ? stats.pickupSec : stats.idleSec;
  const activeDurationLabel = stats.phase === 'riding' ? 'Ride time' : stats.phase === 'toPickup' ? 'Pickup time' : 'Idle time';

  return (
    <div className="w-full max-h-[min(280px,48vh)] overflow-y-auto rounded-[28px] border border-white/25 bg-white/95 p-3.5 text-slate-900 shadow-[0_32px_70px_rgba(9,12,24,0.45)] backdrop-blur-xl sm:max-h-[min(360px,55vh)] sm:rounded-[36px] sm:p-6">
      <div className="flex flex-col gap-3.5 sm:gap-5">
        <div className="flex flex-col gap-1.5 text-[9px] uppercase tracking-[0.32em] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-[10px] sm:tracking-[0.45em]">
          <span className="font-semibold text-slate-600 sm:text-left">{phaseLabel}</span>
          <span className="tracking-[0.28em] text-slate-500 sm:tracking-[0.45em]">
            {activeDurationLabel}
            <span className="ml-2 font-semibold text-slate-800">{formatDuration(activeDuration)}</span>
          </span>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.28em] text-slate-400 sm:text-[10px] sm:tracking-[0.4em]">Distance covered</span>
            <span className="text-lg font-semibold tracking-[0.08em] text-slate-900 sm:text-2xl sm:tracking-[0.12em]">{formatDistance(stats.distanceM)}</span>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[9px] uppercase tracking-[0.28em] text-slate-400 sm:text-[10px] sm:tracking-[0.4em]">Next action</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-600 sm:text-sm sm:tracking-[0.4em]">{config.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrimaryAction}
          className="w-full rounded-full bg-slate-900 py-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-white shadow-[0_22px_55px_rgba(9,12,24,0.45)] transition-transform duration-150 hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98] sm:py-4 sm:text-sm sm:tracking-[0.45em]"
        >
          {config.label}
        </button>

        <p className="px-1 text-center text-[9px] uppercase tracking-[0.32em] text-slate-400 sm:text-[10px] sm:tracking-[0.45em]">
          {phaseHint}
        </p>
      </div>
    </div>
  );
}
