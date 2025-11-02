'use client';

import { useEffect, useRef, useState } from 'react';
import { logRide } from '@/utils/logRide';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

// --- Helper: haversine distance ---
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

// --- Haptics helper ---
async function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'medium') {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    if (type === 'success' || type === 'error') await Haptics.notification({ type });
    else await Haptics.impact({ style: ImpactStyle[type[0].toUpperCase() + type.slice(1) as any] });
  } catch {
    if (type === 'error') navigator.vibrate?.([80, 80, 80]);
    else if (type === 'success') navigator.vibrate?.([80, 40, 80]);
    else navigator.vibrate?.(80);
  }
}

// --- Component ---
export default function RideController() {
  const [phase, setPhase] = useState<RidePhase>('idle');
  const [pickupStartAt, setPickupStartAt] = useState<number | null>(null);
  const [rideStartAt, setRideStartAt] = useState<number | null>(null);
  const [rideEndAt, setRideEndAt] = useState<number | null>(null);
  const [pickupSec, setPickupSec] = useState(0);
  const [rideSec, setRideSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [idle, setIdle] = useState(true);
  const [idleStartAt, setIdleStartAt] = useState<number | null>(Date.now() + 15000);
  const [idleSec, setIdleSec] = useState(0);
  const [now, setNow] = useState(Date.now());

  const watchIdRef = useRef<string | number | null>(null);
  const lastPointRef = useRef<[number, number] | null>(null);
  const wasIdleRef = useRef(false);

  // --- clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // --- timers
  useEffect(() => {
    if (phase === 'toPickup' && pickupStartAt)
      setPickupSec(Math.floor((now - pickupStartAt) / 1000));
    else if (phase === 'riding' && rideStartAt)
      setRideSec(Math.floor(((rideEndAt ?? now) - rideStartAt) / 1000));
  }, [now, phase, pickupStartAt, rideStartAt, rideEndAt]);

  // --- idle tracking
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
        triggerHaptic('light');
        wasIdleRef.current = true;
        logRide({
          phase: 'idle',
          lat: lastPointRef.current?.[0] ?? 0,
          lng: lastPointRef.current?.[1] ?? 0,
          speed: 0,
          distance: 0,
          duration: secs,
          idle_time: secs,
        });
      }
    } else {
      setIdle(false);
      setIdleSec(0);
    }
  }, [phase, now, idleStartAt]);

  // --- broadcast stats
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('rydex-ride-stats', {
      detail: { phase, idle, idleSec, pickupSec, rideSec, distanceM, points },
    }));
  }, [phase, idle, idleSec, pickupSec, rideSec, distanceM, points]);

  // --- GPS tracking helpers
  const startNativeWatch = async () => {
    try {
      watchIdRef.current = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        async (pos: Position | null, err) => {
          if (err || !pos) return console.warn('GPS error', err);
          const { latitude, longitude, accuracy, speed } = pos.coords;

          if (accuracy > 50) return; // wait for lock
          const p: [number, number] = [latitude, longitude];
          setPoints((a) => [...a, p]);

          if (lastPointRef.current) {
            const d = haversineM(lastPointRef.current, p);
            if (d < 500) setDistanceM((m) => m + d);
          }
          lastPointRef.current = p;

          console.log(`📍 GPS fix: ${latitude}, ${longitude} (±${accuracy}m)`);

          await logRide({
            phase: 'riding',
            lat: p[0],
            lng: p[1],
            speed: speed ?? 0,
            distance: distanceM,
            duration: rideSec,
          });
        }
      );
    } catch (e) {
      console.warn('Native watch fallback to browser', e);
      startBrowserWatch();
    }
  };

  const startBrowserWatch = () => {
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        if (accuracy > 50) return;
        const p: [number, number] = [latitude, longitude];
        setPoints((a) => [...a, p]);
        if (lastPointRef.current) {
          const d = haversineM(lastPointRef.current, p);
          if (d < 500) setDistanceM((m) => m + d);
        }
        lastPointRef.current = p;
        await logRide({
          phase: 'riding',
          lat: p[0],
          lng: p[1],
          speed: speed ?? 0,
          distance: distanceM,
          duration: rideSec,
        });
      },
      (err) => console.warn('Browser GPS error', err),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  // --- events
  useEffect(() => {
    const startPickup = () => {
      if (phase !== 'idle') return;
      setPhase('toPickup');
      setPickupStartAt(Date.now());
      setIdle(false);
      setIdleStartAt(null);
      triggerHaptic('heavy');
      const [lat, lng] = lastPointRef.current ?? [0, 0];
      logRide({ phase: 'toPickup', lat, lng, speed: 0, distance: 0, duration: 0 });
    };

    const abortPickup = () => {
      if (phase !== 'toPickup') return;
      setPhase('idle');
      setPickupStartAt(null);
      setIdleStartAt(Date.now() + 15000);
      triggerHaptic('error');
      const [lat, lng] = lastPointRef.current ?? [0, 0];
      logRide({ phase: 'idle', lat, lng, speed: 0, distance: 0, duration: 0 });
    };

    const startRide = async () => {
      if (phase === 'riding') return;
      setPhase('riding');
      setPickupStartAt(null);
      setPickupSec(0);
      setRideStartAt(Date.now());
      setDistanceM(0);
      setPoints([]);
      lastPointRef.current = null;
      triggerHaptic('medium');
      if (Capacitor.isNativePlatform()) await startNativeWatch();
      else startBrowserWatch();
    };

    const endRide = () => {
      if (phase !== 'riding') return;
      setPhase('idle');
      setRideEndAt(Date.now());
      setIdleStartAt(Date.now() + 15000);
      setIdleSec(0);
      wasIdleRef.current = false;
      triggerHaptic('success');
      if (watchIdRef.current != null) {
        if (Capacitor.isNativePlatform()) Geolocation.clearWatch({ id: watchIdRef.current as string });
        else navigator.geolocation.clearWatch(watchIdRef.current as number);
        watchIdRef.current = null;
      }
      window.dispatchEvent(new CustomEvent('rydex-ride-finished', { detail: { rideStartAt, rideEndAt: Date.now(), distanceM, points } }));
      const [lat, lng] = lastPointRef.current ?? [0, 0];
      logRide({ phase: 'idle', lat, lng, speed: 0, distance: distanceM, duration: rideSec });
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
  }, [phase, rideStartAt, distanceM, points, rideSec]);

  return null;
}
