'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RecenterButton from '@/components/RecenterButton'; // ✅ imported new component

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((m) => m.Polyline), { ssr: false });

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

// ✅ binds live map instance
function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (map) onReady(map);
  }, [map, onReady]);
  return null;
}

export default function MapView() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [targetPos, setTargetPos] = useState<[number, number] | null>(null);
  const [stats, setStats] = useState<RideStats>(DEFAULT_STATS);
  const [path, setPath] = useState<[number, number][]>([]);
  const [isUserPanned, setIsUserPanned] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const animRef = useRef<number | null>(null);
  const followMarkerRef = useRef(true);
  const lastPositionRef = useRef<[number, number] | null>(null);

  const lerp = (start: [number, number], end: [number, number], t: number) =>
    [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as [number, number];

  // --- Smooth marker animation ---
  useEffect(() => {
    let startTime: number | null = null;
    const duration = 1000;

    const animate = (time: number) => {
      if (!position || !targetPos) return;
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const newPos = lerp(position, targetPos, t);
      setPosition(newPos);

      if (mapRef.current && followMarkerRef.current && !isUserPanned) {
        mapRef.current.panTo(newPos, { animate: false });
      }

      if (t < 1) animRef.current = requestAnimationFrame(animate);
      else animRef.current = null;
    };

    if (targetPos && position && !animRef.current) {
      animRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetPos, isUserPanned]);

  // --- Geolocation watch + movement filter ---
  useEffect(() => {
    import('leaflet-defaulticon-compatibility').then(() =>
      import('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css')
    );

    if (!navigator.geolocation) return;

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const last = lastPositionRef.current;

        // 🚫 Ignore tiny movements
        if (last && haversineM(last, coords) < 3) return;

        lastPositionRef.current = coords;
        if (!position) setPosition(coords);
        setTargetPos(coords);
        setPath((prev) => [...prev, coords]);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [position]);

  // --- Listen for ride stats updates ---
  useEffect(() => {
    const onStats = (e: Event) => {
      const ce = e as CustomEvent<RideStats>;
      if (ce.detail) setStats(ce.detail);
    };
    window.addEventListener('rydex-ride-stats', onStats as EventListener);
    return () => window.removeEventListener('rydex-ride-stats', onStats as EventListener);
  }, []);

  // --- Listen for external path append events ---
  useEffect(() => {
    const onAppend = (e: Event) => {
      const ce = e as CustomEvent<[number, number]>;
      if (ce.detail) setPath((p) => [...p, ce.detail]);
    };
    window.addEventListener('rydex-path-append', onAppend as EventListener);
    return () => window.removeEventListener('rydex-path-append', onAppend as EventListener);
  }, []);

  // --- Listen for RecenterButton event ---
  useEffect(() => {
    const handleRecenter = () => {
      console.log('📍 Recenter event received');
      followMarkerRef.current = true;
      setIsUserPanned(false);
      if (mapRef.current && position) {
        mapRef.current.flyTo(position, mapRef.current.getZoom(), { animate: true, duration: 0.8 });
      }
    };
    window.addEventListener('rydex-recenter', handleRecenter);
    return () => window.removeEventListener('rydex-recenter', handleRecenter);
  }, [position]);

  // --- Detect manual panning ---
  useEffect(() => {
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
  }, [mapRef.current]);

  if (!position) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );
  }

  const fmt = (s?: number) => {
    if (!s || isNaN(s)) return '00:00:00';
    const date = new Date(s * 1000);
    return date.toISOString().substring(11, 19);
  };

  return (
    <div className="relative h-full w-full z-0">
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={position}
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

          <Marker position={position}>
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

      {/* ✅ external recenter button */}
      <RecenterButton visible={true} />
    </div>
  );
}
