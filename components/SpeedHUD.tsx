'use client';

import { useEffect, useMemo, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type RideStats = {
  phase: RidePhase;
  distanceM: number;
  speedMs: number;
  accuracyM: number | null;
};

const initialStats: RideStats = {
  phase: 'idle',
  distanceM: 0,
  speedMs: 0,
  accuracyM: null,
};

function formatDistance(distanceM: number) {
  const km = distanceM / 1000;
  if (!km) return '0.00 km';
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

function formatAccuracy(accuracy: number | null) {
  if (accuracy == null) return '---';
  if (accuracy >= 1000) return `${(accuracy / 1000).toFixed(1)} km`;
  if (accuracy >= 100) return `${Math.round(accuracy)} m`;
  return `${accuracy.toFixed(0)} m`;
}

export default function SpeedHUD() {
  const [stats, setStats] = useState<RideStats>(initialStats);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;
      setStats((prev) => ({
        phase: detail.phase ?? prev.phase,
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

  return (
    <div className="flex w-full flex-col gap-3 rounded-3xl border border-white/15 bg-slate-900/70 px-5 py-3 text-white shadow-[0_18px_45px_rgba(8,12,24,0.5)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/60">Speed</span>
        <div className="flex items-end gap-2 font-semibold">
          <span className="text-[2.75rem] leading-none">{speedKmh != null ? speedKmh.toFixed(1) : '--.-'}</span>
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/50">km/h</span>
        </div>
      </div>
      <div className="flex flex-row justify-between gap-7 sm:flex-col sm:items-end sm:gap-1.5">
        <div className="flex flex-col gap-1 text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Accuracy</span>
          <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">{accuracyLabel}</span>
        </div>
        <div className="flex flex-col gap-1 text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Distance</span>
          <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">{distanceLabel}</span>
        </div>
      </div>
    </div>
  );
}
