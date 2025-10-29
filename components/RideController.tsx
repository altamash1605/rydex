'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { haptics as baseHaptics } from '@/utils/haptics';

// --- helpers ---
function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type RidePhase = 'idle' | 'toPickup' | 'riding';

// --- component ---
export default function RideController() {
  const [phase, setPhase] = useState<RidePhase>('idle');

  const [pickupStartAt, setPickupStartAt] = useState<number | null>(null);
  const [pickupSec, setPickupSec] = useState(0);

  const [rideStartAt, setRideStartAt] = useState<number | null>(null);
  const [rideEndAt, setRideEndAt] = useState<number | null>(null);
  const [rideSec, setRideSec] = useState(0);

  const [distanceM, setDistanceM] = useState(0);
  const [points, setPoints] = useState<[number, number][]>([]);

  const [idle, setIdle] = useState(true);
  const [idleStartAt, setIdleStartAt] = useState<number | null>(
    Date.now() + 15000
  );
  const [idleSec, setIdleSec] = useState(0);

  const [now, setNow] = useState(Date.now());
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<[number, number] | null>(null);
  const wasIdleRef = useRef(false);

  // 🔹 safely extend haptics with optional fields
  const base = baseHaptics as Record<string, any>;
  const haptics = {
    ...base,
    pickupStart: base?.pickupStart ?? (() => navigator.vibrate?.(100)),
    abortPickup: base?.abortPickup ?? (() => navigator.vibrate?.([80, 80, 80])),
  };

  // 🔹 Tick every second
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 🔹 Timers per phase
  useEffect(() => {
    if (phase === 'toPickup' && pickupStartAt)
      setPickupSec(Math.floor((now - pickupStartAt) / 1000));
    else if (phase === 'riding' && rideStartAt)
      setRideSec(Math.floor(((rideEndAt ?? now) - rideStartAt) / 1000));
  }, [now, phase, pickupStartAt, rideStartAt, rideEndAt]);

  // 🔹 Idle logic
  useEffect(() => {
    if (phase !== 'idle') {
      setIdle(false);
      setIdleSec(0);
      wasIdleRef.current = false;
      return;
    }

    if (!idleStartAt) {
      setIdleStartAt(Date.now() + 15000);
      return;
    }

    if (now >= idleStartAt) {
      const secs = Math.floor((now - idleStartAt) / 1000);
      setIdle(true);
      setIdleSec(secs);
      if (!wasIdleRef.current) {
        haptics.idle?.() ?? navigator.vibrate?.(50);
        wasIdleRef.current = true;
      }
    } else {
      setIdle(false);
      setIdleSec(0);
    }
  }, [phase, now, idleStartAt]);

  // 🔹 Broadcast stats
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('rydex-ride-stats', {
        detail: {
          phase,
          idle,
          idleSec,
          pickupSec,
          rideSec,
          distanceM,
          points,
        },
      })
    );
  }, [phase, idle, idleSec, pickupSec, rideSec, distanceM, points]);

  // --- Phase event handlers ---
  useEffect(() => {
    const startPickup = () => {
      if (phase !== 'idle') return;
      setPhase('toPickup');
      setPickupStartAt(Date.now());
      setPickupSec(0);
      setIdle(false);
      setIdleStartAt(null);
      haptics.pickupStart?.() ?? navigator.vibrate?.(100);
    };

    const abortPickup = () => {
      if (phase !== 'toPickup') return;
      setPhase('idle');
      setPickupStartAt(null);
      setPickupSec(0);
      setIdleStartAt(Date.now() + 15000);
      haptics.abortPickup?.() ?? navigator.vibrate?.([80, 80, 80]);
    };

    const startRide = () => {
      if (phase !== 'toPickup') return;
      setPhase('riding');
      setRideStartAt(Date.now());
      setRideEndAt(null);
      setRideSec(0);
      setDistanceM(0);
      setPoints([]);
      lastPointRef.current = null;
      haptics.startRide?.() ?? navigator.vibrate?.([80, 40, 80]);

      // Start GPS
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const p: [number, number] = [
              pos.coords.latitude,
              pos.coords.longitude,
            ];
            setPoints((arr) => [...arr, p]);
            if (lastPointRef.current) {
              const d = haversineM(lastPointRef.current, p);
              if (d < 500) setDistanceM((m) => m + d);
            }
            lastPointRef.current = p;
          },
          (err) => console.warn('GPS error', err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    };

    const endRide = () => {
      if (phase !== 'riding') return;
      setPhase('idle');
      setRideEndAt(Date.now());
      setIdleStartAt(Date.now() + 15000);
      setIdleSec(0);
      wasIdleRef.current = false;
      haptics.endRide?.() ?? navigator.vibrate?.(200);

      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      const payload = {
        rideStartAt,
        rideEndAt: Date.now(),
        distanceM,
        points,
      };
      window.dispatchEvent(
        new CustomEvent('rydex-ride-finished', { detail: payload })
      );
    };

    window.addEventListener('rydex-pickup-start', startPickup);
    window.addEventListener('rydex-pickup-abort', abortPickup);
    window.addEventListener('rydex-ride-start', startRide);
    window.addEventListener('rydex-ride-end', endRide);

    return () => {
      window.removeEventListener('rydex-pickup-start', startPickup);
      window.removeEventListener('rydex-pickup-abort', abortPickup);
      window.removeEventListener('rydex-ride-start', startRide);
      window.removeEventListener('rydex-ride-end', endRide);
    };
  }, [phase, rideStartAt, distanceM, points]);

  return null;
}
