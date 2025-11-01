'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function distM(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type RidePhase = 'idle' | 'toPickup' | 'riding';

export default function SpeedHUD() {
  const [kmh, setKmh] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [totalM, setTotalM] = useState(0);

  const [phase, setPhase] = useState<RidePhase>('idle');
  const [pickupStartAt, setPickupStartAt] = useState<number | null>(null);
  const [rideStartAt, setRideStartAt] = useState<number | null>(null);
  const [lastRideEndAt, setLastRideEndAt] = useState<number | null>(null);
  const [pickupSec, setPickupSec] = useState(0);
  const [rideSec, setRideSec] = useState(0);

  const last = useRef<{ coords: GeolocationCoordinates; t: number } | null>(null);

  // ---- SPEED TRACKING ----
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { coords, timestamp } = pos;
        setAccuracy(typeof coords.accuracy === 'number' ? coords.accuracy : null);

        let speedMS =
          typeof coords.speed === 'number' && !Number.isNaN(coords.speed)
            ? coords.speed
            : null;

        if (!speedMS && last.current) {
          const dt = (timestamp - last.current.t) / 1000;
          if (dt > 0.5 && dt < 10) {
            const d = distM(last.current.coords, coords);
            speedMS = d / dt;
            setTotalM((m) => m + d);
          }
        } else if (last.current) {
          const d = distM(last.current.coords, coords);
          if (d < 200) setTotalM((m) => m + d);
        }

        if (speedMS != null) {
          const kmhVal = Math.max(0, Math.min(120, speedMS * 3.6));
          setKmh(Number(kmhVal.toFixed(1)));
        }

        last.current = { coords, t: timestamp };
      },
      (err) => console.warn('Geolocation error', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ---- LISTEN TO RIDE EVENTS ----
  useEffect(() => {
    const onStats = (e: any) => {
      const d = e.detail;
      setPhase(d.phase);
      setPickupSec(d.pickupSec);
      setRideSec(d.rideSec);

      if (d.phase === 'toPickup' && !pickupStartAt) setPickupStartAt(Date.now());
      if (d.phase === 'riding' && !rideStartAt) setRideStartAt(Date.now());
      if (d.phase === 'idle') {
        if (rideStartAt && !lastRideEndAt) setLastRideEndAt(Date.now());
        setPickupStartAt(null);
        setRideStartAt(null);
      }
    };
    window.addEventListener('rydex-ride-stats', onStats);
    return () => window.removeEventListener('rydex-ride-stats', onStats);
  }, [pickupStartAt, rideStartAt, lastRideEndAt]);

  const now = Date.now();
  const expanded = phase === 'toPickup' || phase === 'riding';
  const startedAt = (t: number | null) =>
    t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
  const formatMins = (s: number) => `${Math.floor(s / 60)}m`;
  const lastRideAgo =
    lastRideEndAt ? `${Math.max(1, Math.floor((now - lastRideEndAt) / 60000))}m ago` : null;

  return (
    <div
      className="absolute bottom-12 md:bottom-8 left-1/2 z-20 pointer-events-none"
      style={{ transform: 'translateX(-50%)' }}
    >
      <motion.div
        className="pointer-events-auto rounded-xl bg-black/80 text-white px-4 py-2 shadow-lg text-center overflow-hidden origin-center max-w-[90vw]"
        animate={{ scaleX: expanded ? 1.3 : 1, scaleY: expanded ? 1.05 : 1 }}
        transition={{
          type: 'spring',
          stiffness: 180,
          damping: 16,
        }}
      >
        <div className="text-[28px] leading-none font-semibold tracking-tight">
          {kmh !== null ? `${kmh}` : '--'}{' '}
          <span className="text-sm font-medium">km/h</span>
        </div>
        <div className="mt-1 text-[11px] text-white/70">
          dist {(totalM / 1000).toFixed(2)} km · acc{' '}
          {accuracy ? `${Math.round(accuracy)}m` : '--'}
        </div>

        <AnimatePresence mode="wait">
          {phase === 'toPickup' && (
            <motion.div
              key="pickup"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="mt-2 text-xs text-white/80"
            >
              <div>🚕 Going to Pickup</div>
              <div>Started at: {startedAt(pickupStartAt)}</div>
              <div>Duration: {formatMins(pickupSec)}</div>
            </motion.div>
          )}

          {phase === 'riding' && (
            <motion.div
              key="riding"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="mt-2 text-xs text-white/80"
            >
              <div>🚗 Ride in Progress</div>
              <div>Started at: {startedAt(rideStartAt)}</div>
              <div>Duration: {formatMins(rideSec)}</div>
            </motion.div>
          )}

          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="mt-2 text-xs text-white/70"
            >
              {lastRideAgo ? `Last Ride: ${lastRideAgo}` : 'IDLE'}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
