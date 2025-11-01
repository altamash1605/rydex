'use client';

import { useEffect, useRef, useState } from 'react';

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

type LatLng = [number, number];

export function useGeoTracker() {
  const [path, setPath] = useState<LatLng[]>([]);
  const currentPos = useRef<LatLng | null>(null);
  const watchIdRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function startWatch() {
      try {
        if (Geolocation) {
          // ✅ Native (Capacitor) GPS tracking
          watchIdRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
            (pos: any, err: any) => {
              if (!isMounted) return;
              if (err) {
                console.warn('Capacitor GPS error:', err);
                return;
              }
              const { latitude, longitude, accuracy } = pos.coords;
              currentPos.current = [latitude, longitude];
              setPath((p) => [...p, [latitude, longitude]]);
              console.log(`📍 [Native] ${latitude}, ${longitude} (±${accuracy} m)`);
            }
          );
        } else if ('geolocation' in navigator) {
          // 🌐 Web fallback
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              if (!isMounted) return;
              const { latitude, longitude, accuracy } = pos.coords;
              currentPos.current = [latitude, longitude];
              setPath((p) => [...p, [latitude, longitude]]);
              console.log(`🌍 [Web] ${latitude}, ${longitude} (±${accuracy} m)`);
            },
            (err) => console.warn('Web GPS error:', err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        } else {
          alert('Geolocation not supported on this device.');
        }
      } catch (err) {
        console.warn('GeoTracker init error:', err);
      }
    }

    startWatch();

    return () => {
      isMounted = false;
      // Clear watch
      if (Geolocation && watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current });
      } else if (navigator.geolocation && watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { path, currentPos };
}
