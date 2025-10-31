'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSpring } from 'framer-motion';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RecenterButton from '@/components/RecenterButton';

// --- Dynamic imports (client-only Leaflet components) ---
const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((m) => m.Polyline), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then((m) => m.Circle), { ssr: false });

const MapRefBinder = dynamic(() =>
  import('react-leaflet').then((m) => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => {
        if (map) onReady(map);
      }, [map, onReady]);
      return null;
    },
  }))
);

// --- Types ---
type RideStats = {
  phase?: 'idle' | 'toPickup' | 'riding';
  active?: boolean;
  idle: boolean;
  idleSec: number;
  pickupSec?: number;
  rideSec?: number;
  durationSec?: number;
  distanceM: number;
  avgSpeedKmh?: number;
};

const DEFAULT_STATS: RideStats = {
  phase: 'idle',
  active: false,
  idle: true,
  idleSec: 0,
  pickupSec: 0,
  rideSec: 0,
  durationSec: 0,
  distanceM: 0,
  avgSpeedKmh: 0,
};

// --- Helpers ---
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

// --- Component ---
export default function MapView() {
  const [hasMounted, setHasMounted] = useState(false);
  const [stats, setStats] = useState<RideStats>(DEFAULT_STATS);
  const [path, setPath] = useState<[number, number][]>([]);
  const [isUserPanned, setIsUserPanned] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const followMarkerRef = useRef(true);
  const lastPosRef = useRef<[number, number] | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // --- Smooth motion springs ---
  const latSpring = useSpring(0, { stiffness: 60, damping: 15 });
  const lngSpring = useSpring(0, { stiffness: 60, damping: 15 });

  const [position, setPosition] = useState<[number, number] | null>(null);

  // --- GPS Watch with adaptive filtering ---
  useEffect(() => {
    if (!hasMounted || typeof navigator === 'undefined') return;

    import('leaflet-defaulticon-compatibility').then(() =>
      import('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css')
    );

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const now = Date.now();

        const last = lastPosRef.current;
        const lastTime = lastTimeRef.current;
        const dt = lastTime ? (now - lastTime) / 1000 : 1; // seconds

        if (last) {
          const dist = haversineM(last, coords); // meters
          const speed = dist / dt; // m/s

          // Ignore tiny jitter
          if (dist < 3) return;

          // 🚀 Adaptive filtering — skip updates if moving fast
          if (speed > 10 && dt < 3) return; // >36 km/h, only once every 3s
          if (speed > 3 && dt < 1.5) return; // 10–36 km/h, every 1.5s
        }

        // Store current for next cycle
        lastPosRef.current = coords;
        lastTimeRef.current = now;

        // Update position and springs
        setPosition(coords);
        setPath((p) => [...p, coords]);
        latSpring.set(coords[0]);
        lngSpring.set(coords[1]);

        // Auto-follow
        if (followMarkerRef.current && mapRef.current && !isUserPanned) {
          mapRef.current.setView(coords, mapRef.current.getZoom(), { animate: true });
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watch);
    };
  }, [hasMounted, isUserPanned, latSpring, lngSpring]);

  // --- Compute smoothed position from springs ---
  const smoothLat = latSpring.get();
  const smoothLng = lngSpring.get();
  const smoothPosition: [number, number] | null =
    position ? [smoothLat, smoothLng] : null;

  // --- Mount detection ---
  useEffect(() => setHasMounted(true), []);

  // --- Recenter Button ---
  useEffect(() => {
    if (!hasMounted) return;
    const handleRecenter = () => {
      followMarkerRef.current = true;
      setIsUserPanned(false);
      if (mapRef.current && position) {
        mapRef.current.flyTo(position, mapRef.current.getZoom(), { animate: true, duration: 0.8 });
      }
    };
    window.addEventListener('rydex-recenter', handleRecenter);
    return () => {
      window.removeEventListener('rydex-recenter', handleRecenter);
    };
  }, [hasMounted, position]);

  // --- Detect manual panning (build-safe) ---
  useEffect(() => {
    if (!hasMounted) return;
    const map = mapRef.current;
    if (!map) return;

    const stopFollowing = () => {
      followMarkerRef.current = false;
      setIsUserPanned(true);
    };

    map.on('dragstart', stopFollowing);
    return () => {
      map.off('dragstart', stopFollowing);
    };
  }, [hasMounted]);

  if (!hasMounted || !smoothPosition)
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );

  const fmt = (s?: number) => {
    if (!s || isNaN(s)) return '00:00:00';
    const date = new Date(s * 1000);
    return date.toISOString().substring(11, 19);
  };

  // --- Render ---
  return (
    <div className="relative h-full w-full z-0">
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={smoothPosition}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          doubleClickZoom
          boxZoom
          scrollWheelZoom
          dragging
          touchZoom
        >
          <MapRefBinder onReady={(map) => (mapRef.current = map)} />

          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#808080', weight: 4, opacity: 0.9 }} />
          )}

          {/* Blue location dot */}
          <Circle
            center={smoothPosition}
            radius={6}
            pathOptions={{
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.9,
              weight: 0,
            }}
          />

          {/* Tooltip marker */}
          <Marker position={smoothPosition}>
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <div className="text-xs">
                <div className="font-semibold mb-1">
                  {stats.phase === 'riding'
                    ? 'Ride in Progress'
                    : stats.phase === 'toPickup'
                    ? 'Going to Pickup'
                    : stats.idle
                    ? 'Idle'
                    : 'Stopped'}
                </div>
                {stats.phase === 'toPickup' && <div>Pickup Time {fmt(stats.pickupSec)}</div>}
                {stats.phase === 'riding' && <div>Ride Time {fmt(stats.rideSec)}</div>}
                <div>Dist {(stats.distanceM / 1000).toFixed(2)} km</div>
                {typeof stats.avgSpeedKmh === 'number' && (
                  <div>Avg {stats.avgSpeedKmh.toFixed(1)} km/h</div>
                )}
                {stats.phase === 'idle' && <div>Idle for {stats.idleSec}s</div>}
              </div>
            </Tooltip>
          </Marker>
        </MapContainer>
      </div>

      <RecenterButton visible={true} />
    </div>
  );
}
