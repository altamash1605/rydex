'use client';

import { useEffect, useRef, useState } from 'react';

// Haversine distance in meters
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

export default function SpeedHUD() {
  const [kmh, setKmh] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [totalM, setTotalM] = useState(0);

  const last = useRef<{ coords: GeolocationCoordinates; t: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { coords, timestamp } = pos;
        setAccuracy(typeof coords.accuracy === 'number' ? coords.accuracy : null);

        // Prefer device-provided speed when available
        let speedMS = typeof coords.speed === 'number' && !Number.isNaN(coords.speed)
          ? coords.speed
          : null;

        if (!speedMS && last.current) {
          // Fallback: compute from last fix
          const dt = (timestamp - last.current.t) / 1000; // seconds
          if (dt > 0.5 && dt < 10) {
            const d = distM(last.current.coords, coords); // meters
            speedMS = d / dt;
            setTotalM((m) => m + d);
          }
        } else if (last.current) {
          // Even when device gives speed, accumulate distance approx.
          const d = distM(last.current.coords, coords);
          if (d < 200) setTotalM((m) => m + d); // ignore wild jumps
        }

        if (speedMS != null) {
          const kmhVal = Math.max(0, Math.min(120, speedMS * 3.6)); // clamp to reasonable range
          setKmh(Number(kmhVal.toFixed(1)));
        }

        last.current = { coords, t: timestamp };
      },
      (err) => {
        console.warn('Geolocation error', err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return (
    <div className="absolute bottom-24 md:bottom-12 left-1/2 -translate-x-1/2 z-20">
      <div className="rounded-xl bg-black/80 text-white px-4 py-2 shadow-lg min-w-[140px] text-center">
        <div className="text-[28px] leading-none font-semibold tracking-tight">
          {kmh !== null ? `${kmh}` : '--'} <span className="text-sm font-medium">km/h</span>
        </div>
        <div className="mt-1 text-[11px] text-white/70">
          dist {(totalM / 1000).toFixed(2)} km · acc {accuracy ? `${Math.round(accuracy)}m` : '--'}
        </div>
      </div>
    </div>
  );
}
