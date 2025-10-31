'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSpring } from 'framer-motion';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RecenterButton from '@/components/RecenterButton';

// ---- dynamic leaflet pieces ----
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then(m => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => { if (map) onReady(map); }, [map, onReady]);
      return null;
    }
  }))
);

type RideStats = {
  phase?: 'idle' | 'toPickup' | 'riding';
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
  idle: true,
  idleSec: 0,
  pickupSec: 0,
  rideSec: 0,
  durationSec: 0,
  distanceM: 0,
  avgSpeedKmh: 0
};

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

export default function MapView() {
  const [hasMounted, setHasMounted] = useState(false);
  const [stats, setStats] = useState<RideStats>(DEFAULT_STATS);
  const [path, setPath] = useState<[number, number][]>([]);
  const [isUserPanned, setIsUserPanned] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const followMarkerRef = useRef(true);

  const lastPosRef = useRef<[number, number] | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const velocityRef = useRef<{ dLat: number; dLng: number }>({ dLat: 0, dLng: 0 });

  // ultra-smooth springs
  const latSpring = useSpring(0, { stiffness: 25, damping: 25, mass: 2 });
  const lngSpring = useSpring(0, { stiffness: 25, damping: 25, mass: 2 });

  const [position, setPosition] = useState<[number, number] | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // ---- GPS watch ----
  useEffect(() => {
    if (!hasMounted || typeof navigator === 'undefined') return;
    import('leaflet-defaulticon-compatibility').then(() =>
      import('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css')
    );

    const watch = navigator.geolocation.watchPosition(
      pos => {
        const now = Date.now();
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const last = lastPosRef.current;
        const lastTime = lastTimeRef.current;

        if (last && lastTime) {
          const dt = (now - lastTime) / 1000;
          const dist = haversineM(last, coords);
          if (dist < 2 || dt === 0) return;
          const dLat = (coords[0] - last[0]) / dt;
          const dLng = (coords[1] - last[1]) / dt;
          velocityRef.current = { dLat, dLng };
        }

        lastPosRef.current = coords;
        lastTimeRef.current = now;
        setPosition(coords);
        setPath(p => [...p, coords]);
        latSpring.set(coords[0]);
        lngSpring.set(coords[1]);

        if (followMarkerRef.current && mapRef.current && !isUserPanned) {
          mapRef.current.setView(coords, mapRef.current.getZoom(), { animate: true });
        }
      },
      err => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [hasMounted, isUserPanned, latSpring, lngSpring]);

  // ---- predictive loop ----
  useEffect(() => {
    if (!hasMounted) return;
    let raf: number;
    let last = performance.now();

    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const lastPos = lastPosRef.current;
      if (lastPos) {
        const { dLat, dLng } = velocityRef.current;
        const predicted: [number, number] = [
          lastPos[0] + dLat * dt,
          lastPos[1] + dLng * dt
        ];
        velocityRef.current = { dLat: dLat * 0.995, dLng: dLng * 0.995 }; // slower decay
        latSpring.set(predicted[0]);
        lngSpring.set(predicted[1]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasMounted, latSpring, lngSpring]);

  // ---- mount ----
  useEffect(() => setHasMounted(true), []);

  // ---- recenter ----
  useEffect(() => {
    if (!hasMounted) return;
    const recenter = () => {
      followMarkerRef.current = true;
      setIsUserPanned(false);
      if (mapRef.current && position) {
        mapRef.current.flyTo(position, mapRef.current.getZoom(), { animate: true, duration: 0.8 });
      }
    };
    window.addEventListener('rydex-recenter', recenter);
    return () => window.removeEventListener('rydex-recenter', recenter);
  }, [hasMounted, position]);

  // ---- manual pan detection ----
  useEffect(() => {
    if (!hasMounted) return;
    const map = mapRef.current;
    if (!map) return;
    const stopFollow = () => {
      followMarkerRef.current = false;
      setIsUserPanned(true);
    };
    map.on('dragstart', stopFollow);
    return () => map.off('dragstart', stopFollow);
  }, [hasMounted]);

  // ---- tooltip follow ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tooltipRef.current) return;
    const updateTooltip = () => {
      const lat = latSpring.get();
      const lng = lngSpring.get();
      const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
      const el = tooltipRef.current!;
      el.style.transform = `translate(${pt.x - 40}px, ${pt.y - 60}px)`; // above dot
      requestAnimationFrame(updateTooltip);
    };
    updateTooltip();
  }, [latSpring, lngSpring]);

  const smoothPos: [number, number] = [latSpring.get(), lngSpring.get()];
  if (!hasMounted || !smoothPos) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );
  }

  const fmt = (s?: number) => {
    if (!s || isNaN(s)) return '00:00:00';
    const d = new Date(s * 1000);
    return d.toISOString().substring(11, 19);
  };

  // ---- render ----
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapContainer
          center={smoothPos}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          doubleClickZoom
          scrollWheelZoom
          dragging
        >
          <MapRefBinder onReady={map => (mapRef.current = map)} />
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#808080', weight: 4, opacity: 0.9 }} />
          )}

          <Circle
            center={smoothPos}
            radius={6}
            pathOptions={{
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.9,
              weight: 0
            }}
          />

          <Marker position={smoothPos} />
        </MapContainer>
      </div>

      {/* stable tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white rounded-md shadow px-2 py-1 text-[10px] font-medium"
      >
        {stats.phase === 'riding'
          ? 'Ride in Progress'
          : stats.phase === 'toPickup'
          ? 'Going to Pickup'
          : stats.idle
          ? 'Idle'
          : 'Stopped'}
        <div>{stats.phase === 'riding' && <>Ride Time {fmt(stats.rideSec)}</>}</div>
      </div>

      <RecenterButton visible={true} />
    </div>
  );
}
