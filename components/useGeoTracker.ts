'use client';

import { useEffect, useRef, useState } from 'react';
import {
  initializeLocationStore,
  getLocationState,
  recordLocation,
  reloadLocationStoreFromStorage,
  subscribeToLocationStore,
  type LatLng,
} from '../utils/locationStore';
import { startBackgroundTracking } from '../utils/backgroundLocation';

// Optional dynamic import so web build doesn’t break if Capacitor isn’t present
let Geolocation: any = null;
let geolocationLoadPromise: Promise<void> | null = null;

function ensureCapacitorGeolocation(): Promise<void> {
  if (geolocationLoadPromise) return geolocationLoadPromise;
  if (typeof window === 'undefined') return Promise.resolve();

  geolocationLoadPromise = import('@capacitor/geolocation')
    .then((mod) => {
      Geolocation = mod.Geolocation;
    })
    .catch(() => {
      Geolocation = undefined;
    })
    .finally(() => {
      geolocationLoadPromise = null;
    });

  return geolocationLoadPromise;
}

export function useGeoTracker() {
  const [path, setPath] = useState<LatLng[]>([]);
  const currentPos = useRef<LatLng | null>(null);
  const watchIdRef = useRef<any>(null);
  const lastLog = useRef(0);

  // 🧠 initialize local store
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      await initializeLocationStore();
      if (!isMounted) return;

      const initialState = getLocationState();
      setPath(initialState.path);
      currentPos.current = initialState.current;

      unsubscribe = subscribeToLocationStore((state) => {
        if (!isMounted) return;
        // Avoid redundant renders if path unchanged
        if (state.path.length !== path.length) setPath(state.path);
        currentPos.current = state.current;
      });
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  // 🔄 handle visibility / reload from storage
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        const snapshot = await reloadLocationStoreFromStorage();
        setPath(snapshot.path);
        currentPos.current = snapshot.current;
      }
    };

    const handleWindowFocus = async () => {
      const snapshot = await reloadLocationStoreFromStorage();
      setPath(snapshot.path);
      currentPos.current = snapshot.current;
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // 📡 start GPS watch + background tracking
  useEffect(() => {
    let isMounted = true;

    async function startWatch() {
      try {
        await ensureCapacitorGeolocation();
        const handlePos = (latitude: number, longitude: number, accuracy: number) => {
          if (!isMounted) return;
          void recordLocation([latitude, longitude], accuracy);

          // Light debug log every 30 s
          const now = Date.now();
          if (now - lastLog.current > 30000) {
            console.log(`📍 Position update: ${latitude}, ${longitude} (±${accuracy} m)`);
            lastLog.current = now;
          }
        };

        if (Geolocation) {
          // ✅ Native (Capacitor) GPS tracking — throttled to ~3 s
          watchIdRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 3000, maximumAge: 2000 },
            (pos: any, err: any) => {
              if (!isMounted) return;
              if (err) return console.warn('Capacitor GPS error:', err);
              const { latitude, longitude, accuracy } = pos.coords;
              handlePos(latitude, longitude, accuracy);
            }
          );
        } else if ('geolocation' in navigator) {
          // 🌐 Web fallback
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              if (!isMounted) return;
              const { latitude, longitude, accuracy } = pos.coords;
              handlePos(latitude, longitude, accuracy);
            },
            (err) => console.warn('Web GPS error:', err),
            { enableHighAccuracy: true, timeout: 3000, maximumAge: 2000 }
          );
        } else {
          alert('Geolocation not supported on this device.');
        }
      } catch (err) {
        console.warn('GeoTracker init error:', err);
      }
    }

    void startWatch();
    void startBackgroundTracking(); // still launches native background tracking

    return () => {
      isMounted = false;
      if (Geolocation && watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current });
      } else if (navigator.geolocation && watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { path, currentPos };
}
