'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type ButtonState = {
  label: string;
  event: 'rydex-pickup-start' | 'rydex-ride-start' | 'rydex-ride-end';
};

type RideStats = {
  phase: RidePhase;
};

const initialStats: RideStats = {
  phase: 'idle',
};

export default function ButtonBar() {
  const [stats, setStats] = useState<RideStats>(initialStats);

  useEffect(() => {
    const handleStats: EventListener = (event) => {
      const detail = (event as CustomEvent).detail as Partial<RideStats> | undefined;
      if (!detail) return;
      setStats((prev) => ({
        phase: detail.phase ?? prev.phase,
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
        return 'Ready to start ride';
      case 'riding':
        return 'Ride in progress';
      default:
        return 'Awaiting assignment';
    }
  }, [stats.phase]);

  return (
    <div className="w-full rounded-[28px] border border-white/20 bg-white/95 px-4 py-5 text-slate-900 shadow-[0_24px_60px_rgba(9,12,24,0.35)] backdrop-blur-xl sm:rounded-[32px] sm:px-6">
      <div className="flex flex-col items-center gap-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">{phaseLabel}</span>
        <button
          type="button"
          onClick={handlePrimaryAction}
          className="w-full rounded-full bg-slate-900 py-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-white shadow-[0_18px_42px_rgba(9,12,24,0.45)] transition-transform duration-150 hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/60 active:scale-[0.98] sm:py-3.5"
        >
          {config.label}
        </button>
      </div>
    </div>
  );
}
