'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type RideStats = {
  phase: RidePhase;
  distanceM: number;
  speedMs: number;
  accuracyM: number | null;
  idleSec?: number;
  pickupSec?: number;
  rideSec?: number;
  lat?: number;
  lng?: number;
  coords?: [number, number];
};

const initialStats: RideStats = {
  phase: 'idle',
  distanceM: 0,
  speedMs: 0,
  accuracyM: null,
};

// ---------- helpers ----------
function formatDistance(m: number) {
  const km = m / 1000;
  if (!km) return '0.00 km';
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}
function formatAccuracy(a: number | null) {
  if (a == null) return '---';
  if (a >= 1000) return `${(a / 1000).toFixed(1)} km`;
  if (a >= 100) return `${Math.round(a)} m`;
  return `${a.toFixed(0)} m`;
}
function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function formatMinutes(seconds?: number) {
  if (seconds == null || seconds < 0) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${pad2(minutes)}m`;
}
function formatLat(n?: number) {
  return typeof n === 'number' ? n.toFixed(6) : '—';
}
function formatLng(n?: number) {
  return typeof n === 'number' ? n.toFixed(6) : '—';
}

// ---------- component ----------
function SpeedHUDBase() {
  const [stats, setStats] = useState<RideStats>(initialStats);
  const [expanded, setExpanded] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(() => {
    try {
      return localStorage.getItem('hudDebug') === '1';
    } catch {
      return false;
    }
  });

  const enableDebug = (on: boolean) => {
    setDebugEnabled(on);
    try {
      localStorage.setItem('hudDebug', on ? '1' : '0');
    } catch {}
  };

  const [phaseSinceMs, setPhaseSinceMs] = useState(Date.now());
  const [tick, setTick] = useState(0);

  const [eventCount, setEventCount] = useState(0);
  const [lastEventTs, setLastEventTs] = useState<number | null>(null);
  const lastLoggedTsRef = useRef(0);

  const latLabel = useMemo(() => formatLat(stats.lat), [stats.lat]);
  const lngLabel = useMemo(() => formatLng(stats.lng), [stats.lng]);

  // slower tick (2 s) = smoother UI
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 30), 2000);
    return () => clearInterval(id);
  }, []);

  // reset local timer when phase changes
  useEffect(() => {
    setPhaseSinceMs(Date.now());
  }, [stats.phase]);

  // listen for ride stat events
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;

      setStats((prev) => {
        const nextLat =
          typeof detail?.lat === 'number'
            ? detail.lat
            : Array.isArray(detail?.coords)
            ? detail.coords[0]
            : prev.lat;

        const nextLng =
          typeof detail?.lng === 'number'
            ? detail.lng
            : Array.isArray(detail?.coords)
            ? detail.coords[1]
            : prev.lng;

        return {
          phase: (detail.phase as RidePhase) ?? prev.phase,
          distanceM: detail.distanceM ?? prev.distanceM,
          speedMs: detail.speedMs ?? prev.speedMs,
          accuracyM: detail.accuracyM ?? prev.accuracyM,
          idleSec: detail.idleSec ?? prev.idleSec,
          pickupSec: detail.pickupSec ?? prev.pickupSec,
          rideSec: detail.rideSec ?? prev.rideSec,
          lat: nextLat,
          lng: nextLng,
        };
      });

      setEventCount((c) => c + 1);
      setLastEventTs(Date.now());

      const now = Date.now();
      if (debugEnabled && now - lastLoggedTsRef.current >= 5000) {
        lastLoggedTsRef.current = now;
        console.debug('[HUD]', {
          phase: detail.phase,
          speedMs: detail.speedMs,
          speedKmh: detail.speedMs ? detail.speedMs * 3.6 : undefined,
          distanceM: detail.distanceM,
          accuracyM: detail.accuracyM,
        });
      }
    };

    window.addEventListener('rydex-ride-stats', handler);
    return () => window.removeEventListener('rydex-ride-stats', handler);
  }, [debugEnabled]);

  const speedKmh = useMemo(() => {
    if (!stats.speedMs || stats.speedMs < 0.05) return null;
    return stats.speedMs * 3.6;
  }, [stats.speedMs]);

  const distanceLabel = useMemo(() => formatDistance(stats.distanceM), [stats.distanceM]);
  const accuracyLabel = useMemo(() => formatAccuracy(stats.accuracyM), [stats.accuracyM]);

  const timerBlock = useMemo(() => {
    const now = Date.now();
    const elapsed = Math.floor((now - phaseSinceMs) / 1000);
    let label = 'IDLE';
    let sec: number | undefined = stats.idleSec ?? elapsed;

    if (stats.phase === 'toPickup') {
      label = 'PICKUP';
      sec = stats.pickupSec ?? elapsed;
    } else if (stats.phase === 'riding') {
      label = 'RIDE IN PROGRESS';
      sec = stats.rideSec ?? elapsed;
    }
    return { label, value: formatMinutes(sec) };
  }, [stats.phase, stats.idleSec, stats.pickupSec, stats.rideSec, phaseSinceMs, tick]);

  const sinceLastEventSec = useMemo(() => {
    if (lastEventTs == null) return null;
    return Math.floor((Date.now() - lastEventTs) / 1000);
  }, [lastEventTs, tick]);

  const toggleExpanded = () => setExpanded((e) => !e);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
    if ((e.key === 'D' || e.key === 'd') && e.shiftKey) enableDebug(!debugEnabled);
  };

  const freshnessColor =
    sinceLastEventSec == null
      ? 'bg-gray-500'
      : sinceLastEventSec < 2
      ? 'bg-emerald-500'
      : sinceLastEventSec < 5
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onClick={toggleExpanded}
      onKeyDown={onKey}
      className={[
        'relative w-full select-none cursor-pointer',
        'rounded-3xl border border-white/15 bg-slate-900/70',
        'text-white shadow-[0_6px_24px_rgba(8,12,24,0.4)] backdrop-blur-md',
        'px-5 py-3 transition-[max-height] duration-150 ease-out',
      ].join(' ')}
    >
      {/* Speed (always visible) */}
      <div className="flex items-end justify-between gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/60">
            Speed
          </span>
          <div className="flex items-end gap-2 font-semibold">
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
          expanded ? 'max-h-[260px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0',
        ].join(' ')}
      >
        <div className="flex flex-row justify-between gap-7 sm:flex-col sm:items-end sm:gap-1.5">
          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Accuracy</span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">
              {accuracyLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">Distance</span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">
              {distanceLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-[0.45em] text-white/50">
              {timerBlock.label}
            </span>
            <span className="text-[13px] font-medium tracking-[0.18em] text-white/80">
              {timerBlock.value}
            </span>
          </div>
        </div>

        {debugEnabled && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.35em] text-white/50">Debug</span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${freshnessColor}`}
                  aria-label="data freshness dot"
                />
                <span className="text-[11px] text-white/60">
                  {sinceLastEventSec == null
                    ? 'no events yet'
                    : `last event: ${sinceLastEventSec}s ago`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-white/80">
              <div>phase: <span className="text-white/90">{stats.phase}</span></div>
              <div>events: <span className="text-white/90">{eventCount}</span></div>
              <div>speedMs: <span className="text-white/90">{stats.speedMs.toFixed(3)}</span></div>
              <div>speedKmh: <span className="text-white/90">{speedKmh?.toFixed(2) ?? '—'}</span></div>
              <div>accuracyM: <span className="text-white/90">{stats.accuracyM ?? '—'}</span></div>
              <div>distanceM: <span className="text-white/90">{stats.distanceM.toFixed(1)}</span></div>
              <div>lat: <span className="text-white/90">{latLabel}</span></div>
              <div>lng: <span className="text-white/90">{lngLabel}</span></div>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enableDebug(false);
                }}
                className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/15"
              >
                Disable debug
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(SpeedHUDBase);
