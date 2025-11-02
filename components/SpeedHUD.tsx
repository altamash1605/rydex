'use client';

import { useEffect, useMemo, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type RideStats = {
  phase: RidePhase;
  idleSec: number;
  pickupSec: number;
  rideSec: number;
  distanceM: number;
  speedMs: number;
  accuracyM: number | null;
};

const initialStats: RideStats = {
  phase: 'idle',
  idleSec: 0,
  pickupSec: 0,
  rideSec: 0,
  distanceM: 0,
  speedMs: 0,
  accuracyM: null,
};

function formatDuration(secs: number) {
  if (!secs) return '--:--';
  const minutes = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatShortDuration(secs: number) {
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
  if (!km) return '0.00km';
  if (km >= 100) return `${km.toFixed(0)}km`;
  if (km >= 10) return `${km.toFixed(1)}km`;
  return `${km.toFixed(2)}km`;
}

function formatAccuracy(accuracy: number | null) {
  if (accuracy == null) return '---';
  if (accuracy >= 1000) return `${(accuracy / 1000).toFixed(1)}km`;
  if (accuracy >= 100) return `${Math.round(accuracy)}m`;
  return `${accuracy.toFixed(0)}m`;
}

export default function SpeedHUD() {
  const [stats, setStats] = useState<RideStats>(initialStats);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;
      setStats((prev) => ({
        phase: detail.phase ?? prev.phase,
        idleSec: detail.idleSec ?? prev.idleSec,
        pickupSec: detail.pickupSec ?? prev.pickupSec,
        rideSec: detail.rideSec ?? prev.rideSec,
        distanceM: detail.distanceM ?? prev.distanceM,
        speedMs: detail.speedMs ?? prev.speedMs,
        accuracyM: detail.accuracyM ?? prev.accuracyM,
      }));
    };

    window.addEventListener('rydex-ride-stats', handler);
    return () => window.removeEventListener('rydex-ride-stats', handler);
  }, []);

  const speedKmh = useMemo(() => {
    if (!stats.speedMs || stats.speedMs < 0.05) return null;
    return stats.speedMs * 3.6;
  }, [stats.speedMs]);

  const distanceLabel = useMemo(() => formatDistance(stats.distanceM), [stats.distanceM]);
  const accuracyLabel = useMemo(() => formatAccuracy(stats.accuracyM), [stats.accuracyM]);

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

  const activeDuration = stats.phase === 'riding' ? stats.rideSec : stats.phase === 'toPickup' ? stats.pickupSec : stats.idleSec;
  const activeDurationLabel = stats.phase === 'riding' ? 'Ride time' : stats.phase === 'toPickup' ? 'Pickup time' : 'Idle time';

  return (
    <div className="w-full max-w-lg rounded-[32px] border border-white/15 bg-white/10 p-6 text-white shadow-[0_30px_80px_rgba(8,12,24,0.65)] backdrop-blur-xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/60">Current speed</span>
            <div className="flex items-end gap-2 font-semibold">
              <span className="text-6xl leading-none">{speedKmh != null ? speedKmh.toFixed(1) : '--.-'}</span>
              <span className="text-sm uppercase tracking-[0.35em] text-white/50">kmh</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-white/60">
              <span>Accuracy {accuracyLabel}</span>
              <span className="hidden h-1 w-1 rounded-full bg-white/40 md:block" />
              <span>Distance {distanceLabel}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 text-left md:items-end md:text-right">
            <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/50">Status</span>
            <span className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/15 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white">
              {phaseLabel}
            </span>
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">
              {activeDurationLabel}
              <span className="ml-2 font-semibold text-white/80">{formatShortDuration(activeDuration)}</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-[10px] uppercase tracking-[0.4em] text-white/60">
          <div className="flex flex-col gap-1">
            <span className="text-white/40">Idle</span>
            <span className="text-base font-semibold tracking-[0.2em] text-white">{formatDuration(stats.idleSec)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white/40">Pickup</span>
            <span className="text-base font-semibold tracking-[0.2em] text-white">{formatDuration(stats.pickupSec)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white/40">Ride</span>
            <span className="text-base font-semibold tracking-[0.2em] text-white">{formatDuration(stats.rideSec)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
