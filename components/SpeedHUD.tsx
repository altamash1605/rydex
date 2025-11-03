'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type RideStats = {
  phase: RidePhase;
  distanceM: number;
  speedMs: number;
  accuracyM: number | null;

  // Optional seconds from the stats event; we prefer these when present.
  idleSec?: number;
  pickupSec?: number;
  rideSec?: number;
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

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function formatMinutes(seconds?: number) {
  if (seconds == null || seconds < 0) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${pad2(minutes)}m`;
}

export default function SpeedHUD() {
  const [stats, setStats] = useState<RideStats>(initialStats);

  // Accordion state
  const [expanded, setExpanded] = useState(false); // default: collapsed

  // Fallback local timers (if *_Sec not sent from your event)
  const [phaseSinceMs, setPhaseSinceMs] = useState<number>(Date.now());
  const [tick, setTick] = useState(0); // 1Hz refresh for timer text

  const phaseRef = useRef<RidePhase>('idle');

  // Keep refs in sync
  useEffect(() => {
    phaseRef.current = stats.phase;
  }, [stats.phase]);

  // 1Hz ticker
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Reset local timer when phase changes
  useEffect(() => {
    setPhaseSinceMs(Date.now());
  }, [stats.phase]);

  // Listen to ride stats
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;
      setStats((prev) => ({
        phase: (detail.phase as RidePhase) ?? prev.phase,
        distanceM: detail.distanceM ?? prev.distanceM,
        speedMs: detail.speedMs ?? prev.speedMs,
        accuracyM: detail.accuracyM ?? prev.accuracyM,
        idleSec: typeof detail.idleSec === 'number' ? detail.idleSec : prev.idleSec,
        pickupSec: typeof detail.pickupSec === 'number' ? detail.pickupSec : prev.pickupSec,
        rideSec: typeof detail.rideSec === 'number' ? detail.rideSec : prev.rideSec,
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

  // Phase label + minutes (matches theme of right-side blocks)
  const timerBlock = useMemo(() => {
    const now = Date.now();
    const elapsedSecLocal = Math.floor((now - phaseSinceMs) / 1000);

    let label = 'IDLE';
    let sec: number | undefined = stats.idleSec ?? elapsedSecLocal;

    if (stats.phase === 'toPickup') {
      label = 'PICKUP';
      sec = stats.pickupSec ?? elapsedSecLocal;
    } else if (stats.phase === 'riding') {
      label = 'RIDE IN PROGRESS';
      sec = stats.rideSec ?? elapsedSecLocal;
    }

    return { label, value: formatMinutes(sec) };
  }, [stats.phase, stats.idleSec, stats.pickupSec, stats.rideSec, phaseSinceMs, tick]);

  // Click/keyboard toggle handler for the whole HUD
  const toggleExpanded = () => setExpanded((e) => !e);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <div
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onClick={toggleExpanded}
      onKeyDown={onKey}
      className={[
        // container
        'relative w-full select-none cursor-pointer',
        'rounded-3xl border border-white/15 bg-slate-900/70',
        'text-white shadow-[0_18px_45px_rgba(8,12,24,0.5)] backdrop-blur-xl',
        // padding transitions feel nicer when expanding/collapsing
        'px-5 py-3 transition-[padding,max-height] duration-200 ease-out',
      ].join(' ')}
    >
      {/* Top row: Speed (always visible) */}
      <div className="flex items-end justify-between gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/60">Speed</span>
          <div className="flex items-end gap-2 font-semibold">
            {/* Keep the exact same size when collapsed */}
            <span className="text-[2.75rem] leading-none">
              {speedKmh != null ? speedKmh.toFixed(1) : '--.-'}
            </span>
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/50">km/h</span>
          </div>
        </div>
      </div>

      {/* Accordion content */}
      <div
        className={[
          'overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'max-h-[200px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0',
        ].join(' ')}
      >
        <div className="flex flex-row justify-between gap-7 sm:flex-col sm:items-end sm:gap-1.5">
          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Accuracy</span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">{accuracyLabel}</span>
          </div>

          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Distance</span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">{distanceLabel}</span>
          </div>

          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">{timerBlock.label}</span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">{timerBlock.value}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
