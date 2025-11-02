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
(async () => {
  try {
    const mod = await import('@capacitor/geolocation');
    Geolocation = mod.Geolocation;
  } catch {
    // Running on web – ignore
  }
})();

export function useGeoTracker() {
  const [path, setPath] = useState<LatLng[]>([]);
  const currentPos = useRef<LatLng | null>(null);
  const watchIdRef = useRef<any>(null);

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
        setPath(state.path);
        currentPos.current = state.current;
      });
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let appListener: { remove: () => Promise<void> | void } | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        appListener = await App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) {
            const snapshot = await reloadLocationStoreFromStorage();
            setPath(snapshot.path);
            currentPos.current = snapshot.current;
          }
        });
      } catch {
        // App plugin not available (likely web) – no-op
      }
    })();

    return () => {
      void appListener?.remove?.();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function startWatch() {
      try {
        const handlePos = (latitude: number, longitude: number, accuracy: number) => {
          if (!isMounted) return;
          void recordLocation([latitude, longitude], accuracy);
        };

        if (Geolocation) {
          // ✅ Native (Capacitor) GPS tracking with faster interval
          watchIdRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 1000, maximumAge: 0 },
            (pos: any, err: any) => {
              if (!isMounted) return;
              if (err) return console.warn('Capacitor GPS error:', err);
              const { latitude, longitude, accuracy } = pos.coords;
              handlePos(latitude, longitude, accuracy);
              console.log(`📍 [Native] ${latitude}, ${longitude} (±${accuracy} m)`);
            }
          );
        } else if ('geolocation' in navigator) {
          // 🌐 Web fallback (same high-frequency config)
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              if (!isMounted) return;
              const { latitude, longitude, accuracy } = pos.coords;
              handlePos(latitude, longitude, accuracy);
              console.log(`🌍 [Web] ${latitude}, ${longitude} (±${accuracy} m)`);
            },
            (err) => console.warn('Web GPS error:', err),
            { enableHighAccuracy: true, timeout: 1000, maximumAge: 0 }
          );
        } else {
          alert('Geolocation not supported on this device.');
        }
      } catch (err) {
        console.warn('GeoTracker init error:', err);
      }
    }

    void startWatch();
    void startBackgroundTracking();

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
