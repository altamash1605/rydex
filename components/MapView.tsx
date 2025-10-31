'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RecenterButton from '@/components/RecenterButton';

// ---- dynamic leaflet components ----
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then(m => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => {
        if (map) onReady(map);
        return undefined;
      }, [map, onReady]);
      return null;
    }
  }))
);

// ---- helpers ----
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
  const [path, setPath] = useState<[number, number][]>([]);
  const [isUserPanned, setIsUserPanned] = useState(false);

  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const followMarkerRef = useRef(true);

  // --- blending state ---
  const blendFrom = useRef<{ lat: number; lng: number; start: number } | null>(null);
  const blendTo = useRef<{ lat: number; lng: number } | null>(null);
  const lastTooltipPos = useRef<[number, number] | null>(null);

  // ---- map ready ----
  const handleMapReady = (map: LeafletMap) => {
    mapRef.current = map;

    if (!markerRef.current) {
      const marker = L.marker([0, 0], {
        icon: L.icon({
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41]
        })
      }).addTo(map);
      markerRef.current = marker;
    }
  };

  // ---- GPS tracking ----
  useEffect(() => {
    if (!hasMounted || typeof navigator === 'undefined') return undefined;

    import('leaflet-defaulticon-compatibility').then(() =>
      import('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css')
    );

    const watch = navigator.geolocation.watchPosition(
      pos => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const now = Date.now();

        // start blending from current marker position to new fix
        const current = markerRef.current?.getLatLng();
        if (current) {
          blendFrom.current = { lat: current.lat, lng: current.lng, start: now };
        }
        blendTo.current = { lat: coords[0], lng: coords[1] };

        if (followMarkerRef.current && mapRef.current && !isUserPanned) {
          mapRef.current.setView(coords, mapRef.current.getZoom(), { animate: true });
        }
      },
      err => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [hasMounted, isUserPanned]);

  // ---- continuous blending + path-following loop ----
  useEffect(() => {
    if (!hasMounted) return undefined;
    let raf: number;
    const BLEND_DURATION = 800; // ms

    const loop = () => {
      const now = Date.now();
      let lat: number | null = null;
      let lng: number | null = null;

      if (blendFrom.current && blendTo.current) {
        const t = Math.min((now - blendFrom.current.start) / BLEND_DURATION, 1);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * t); // ease-in-out
        lat = blendFrom.current.lat + (blendTo.current.lat - blendFrom.current.lat) * ease;
        lng = blendFrom.current.lng + (blendTo.current.lng - blendFrom.current.lng) * ease;
        if (t >= 1) blendFrom.current = null;
      } else if (blendTo.current) {
        lat = blendTo.current.lat;
        lng = blendTo.current.lng;
      }

      if (lat !== null && lng !== null) {
        // marker + tooltip move
        markerRef.current?.setLatLng([lat, lng]);
        if (tooltipRef.current && mapRef.current) {
          const pt = mapRef.current.latLngToContainerPoint(L.latLng(lat, lng));
          tooltipRef.current.style.transform = `translate(${pt.x - 40}px, ${pt.y - 60}px)`;
        }

        // dynamically extend the path based on tooltip movement
        const last = lastTooltipPos.current;
        const current: [number, number] = [lat, lng];
        if (!last || haversineM(last, current) > 2) {
          // add to path if moved >2m
          setPath(p => [...p, current]);
          lastTooltipPos.current = current;
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasMounted]);

  // ---- mount ----
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ---- manual pan detection ----
  useEffect((): void | (() => void) => {
    if (!hasMounted) return undefined;
    const map = mapRef.current;
    if (!map) return undefined;

    const stopFollow = () => {
      followMarkerRef.current = false;
      setIsUserPanned(true);
    };

    map.on('dragstart', stopFollow);
    return () => {
      map.off('dragstart', stopFollow);
    };
  }, [hasMounted]);

  if (!hasMounted)
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );

  const currentCenter = blendTo.current
    ? [blendTo.current.lat, blendTo.current.lng]
    : [0, 0];

  // ---- render ----
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapContainer
          center={currentCenter as [number, number]}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          doubleClickZoom
          scrollWheelZoom
          dragging
        >
          <MapRefBinder onReady={handleMapReady} />
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#007bff', weight: 4, opacity: 0.9 }} />
          )}

          <Circle
            center={currentCenter as [number, number]}
            radius={6}
            pathOptions={{
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.9,
              weight: 0
            }}
          />
        </MapContainer>
      </div>

      {/* tooltip attached to marker */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white rounded-md shadow px-2 py-1 text-[10px] font-medium"
      >
        Live Ride
      </div>

      <RecenterButton visible={true} />
    </div>
  );
}
