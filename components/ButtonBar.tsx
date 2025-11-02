'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RidePhase = 'idle' | 'toPickup' | 'riding';

type ButtonState = {
  label: string;
  event: 'rydex-pickup-start' | 'rydex-ride-start' | 'rydex-ride-end';
};

export default function ButtonBar() {
  const [phase, setPhase] = useState<RidePhase>('idle');

  useEffect(() => {
    const handleStats: EventListener = (event) => {
      const detail = (event as CustomEvent).detail as { phase?: RidePhase } | undefined;
      if (detail?.phase) setPhase(detail.phase);
    };

    window.addEventListener('rydex-ride-stats', handleStats);
    return () => {
      window.removeEventListener('rydex-ride-stats', handleStats);
    };
  }, []);

  const config = useMemo<ButtonState>(() => {
    switch (phase) {
      case 'toPickup':
        return { label: 'Start Ride', event: 'rydex-ride-start' };
      case 'riding':
        return { label: 'End Ride', event: 'rydex-ride-end' };
      default:
        return { label: 'Go to Pickup', event: 'rydex-pickup-start' };
    }
  }, [phase]);

  const handlePrimaryAction = useCallback(() => {
    window.dispatchEvent(new Event(config.event));
  }, [config.event]);

  return (
    <button
      type="button"
      onClick={handlePrimaryAction}
      className="w-full rounded-full bg-black py-4 text-lg font-semibold uppercase tracking-[0.35em] text-white shadow-[0_18px_40px_rgba(15,23,42,0.3)] transition-transform active:scale-[0.98]"
    >
      {config.label}
    </button>
  );
}
