'use client';

import { useEffect, useRef, useState } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { logRide } from '@/utils/logRide';

// --- Helper: Calculate distance in meters between two lat/lng points ---
function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000; // Earth radius (m)
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

// --- Component ---
export default function RideController() {
  // 🔹 Ride phase tracking
  const [phase, setPhase] = useState<RidePhase>('idle');

  // 🔹 Pickup tracking
  const [pickupStartAt, setPickupStartAt] = useState<number | null>(null);
  const [pickupSec, setPickupSec] = useState(0);

  // 🔹 Ride tracking
  const [rideStartAt, setRideStartAt] = useState<number | null>(null);
  const [rideEndAt, setRideEndAt] = useState<number | null>(null);
  const [rideSec, setRideSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [points, setPoints] = useState<[number, number][]>([]);

  // 🔹 Idle state tracking
  const [idle, setIdle] = useState(true);
  const [idleStartAt, setIdleStartAt] = useState<number | null>(Date.now() + 15000);
  const [idleSec, setIdleSec] = useState(0);

  // 🔹 Internal trackers
  const [now, setNow] = useState(Date.now());
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<[number, number] | null>(null);
  const wasIdleRef = useRef(false);

// ✅ Cross-platform haptics (Capacitor + browser fallback)
const haptics = {
  startRide: async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      navigator.vibrate?.(100);
    }
  },
  endRide: async () => {
    try {
      // Use literal instead of enum for older plugin versions
      await Haptics.notification({ type: 'success' as any });
    } catch {
      navigator.vibrate?.([80, 40, 80]);
    }
  },
  idle: async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      navigator.vibrate?.(50);
    }
  },
  pickupStart: async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      navigator.vibrate?.(100);
    }
  },
  abortPickup: async () => {
    try {
      await Haptics.notification({ type: 'error' as any });
    } catch {
      navigator.vibrate?.([80, 80, 80]);
    }
  },
};

  // --- ⏱ Update every second ---
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // --- 🧮 Update ride/pickup timers ---
  useEffect(() => {
    if (phase === 'toPickup' && pickupStartAt)
      setPickupSec(Math.floor((now - pickupStartAt) / 1000));
    else if (phase === 'riding' && rideStartAt)
      setRideSec(Math.floor(((rideEndAt ?? now) - rideStartAt) / 1000));
  }, [now, phase, pickupStartAt, rideStartAt, rideEndAt]);

  // --- 💤 Idle tracking logic ---
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
        haptics.idle?.();
        wasIdleRef.current = true;

        // Log first idle entry
        logRide({
          phase: 'idle',
          lat: lastPointRef.current?.[0] ?? 0,
          lng: lastPointRef.current?.[1] ?? 0,
          speed: 0,
          idle_time: secs,
        });
      }
    } else {
      setIdle(false);
      setIdleSec(0);
    }
  }, [phase, now, idleStartAt]);

  // --- 📡 Broadcast current ride stats globally ---
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('rydex-ride-stats', {
        detail: { phase, idle, idleSec, pickupSec, rideSec, distanceM, points },
      })
    );
  }, [phase, idle, idleSec, pickupSec, rideSec, distanceM, points]);

  // --- ⚙️ Main event listeners (pickup / ride / abort) ---
  useEffect(() => {
    /** 🟢 Begin pickup phase */
    const startPickup = () => {
      if (phase !== 'idle') return;
      setPhase('toPickup');
      setPickupStartAt(Date.now());
      setPickupSec(0);
      setIdle(false);
      setIdleStartAt(null);
      haptics.pickupStart?.();

      logRide({
        phase: 'toPickup',
        lat: lastPointRef.current?.[0] ?? 0,
        lng: lastPointRef.current?.[1] ?? 0,
        speed: 0,
        pickup_time: 0,
      });
    };

    /** 🔴 Abort pickup */
    const abortPickup = () => {
      if (phase !== 'toPickup') return;
      setPhase('idle');
      setPickupStartAt(null);
      setPickupSec(0);
      setIdleStartAt(Date.now() + 15000);
      haptics.abortPickup?.();

      logRide({
        phase: 'idle',
        lat: lastPointRef.current?.[0] ?? 0,
        lng: lastPointRef.current?.[1] ?? 0,
        speed: 0,
      });
    };

    /** 🚀 Start ride phase */
    const startRide = () => {
      if (phase !== 'toPickup') return;
      setPhase('riding');
      setRideStartAt(Date.now());
      setRideEndAt(null);
      setRideSec(0);
      setDistanceM(0);
      setPoints([]);
      lastPointRef.current = null;
      haptics.startRide?.();

      logRide({
        phase: 'riding',
        lat: lastPointRef.current?.[0] ?? 0,
        lng: lastPointRef.current?.[1] ?? 0,
        speed: 0,
        distance: 0,
        duration: 0,
      });

      // --- 📡 Start continuous GPS tracking ---
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude, longitude, accuracy, speed } = pos.coords;

            // ⚠️ Skip inaccurate fixes (>20 m)
            if (accuracy > 20) {
              console.warn('Skipping inaccurate GPS fix:', accuracy);
              return;
            }

            const p: [number, number] = [latitude, longitude];
            setPoints((arr) => [...arr, p]);

            // Compute incremental distance
            if (lastPointRef.current) {
              const d = haversineM(lastPointRef.current, p);
              if (d < 500) setDistanceM((m) => m + d);
            }
            lastPointRef.current = p;

            console.log(`📍 GPS fix: ${latitude}, ${longitude} (±${accuracy}m)`);

            // Log live GPS data to DB
            await logRide({
              phase: 'riding',
              lat: p[0],
              lng: p[1],
              speed: speed ?? 0,
              distance: distanceM,
              duration: rideSec,
            });
          },
          (err) => console.warn('GPS error', err),
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
        );
      }
    };

    /** 🏁 End ride phase */
    const endRide = () => {
      if (phase !== 'riding') return;
      setPhase('idle');
      setRideEndAt(Date.now());
      setIdleStartAt(Date.now() + 15000);
      setIdleSec(0);
      wasIdleRef.current = false;
      haptics.endRide?.();

      // Stop GPS tracking
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      // Dispatch ride finished event
      const payload = { rideStartAt, rideEndAt: Date.now(), distanceM, points };
      window.dispatchEvent(new CustomEvent('rydex-ride-finished', { detail: payload }));

      // Log final ride summary
      logRide({
        phase: 'idle',
        lat: lastPointRef.current?.[0] ?? 0,
        lng: lastPointRef.current?.[1] ?? 0,
        speed: 0,
        distance: distanceM,
        duration: rideSec,
        ride_time: rideSec,
      });
    };

    // Attach event listeners
    window.addEventListener('rydex-pickup-start', startPickup);
    window.addEventListener('rydex-pickup-abort', abortPickup);
    window.addEventListener('rydex-ride-start', startRide);
    window.addEventListener('rydex-ride-end', endRide);

    // Cleanup
    return () => {
      window.removeEventListener('rydex-pickup-start', startPickup);
      window.removeEventListener('rydex-pickup-abort', abortPickup);
      window.removeEventListener('rydex-ride-start', startRide);
      window.removeEventListener('rydex-ride-end', endRide);
    };
  }, [phase, rideStartAt, distanceM, points, rideSec]);

  return null;
}
