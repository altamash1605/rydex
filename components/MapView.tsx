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
  const liveSegmentRef = useRef<L.Polyline | null>(null);
  const followMarkerRef = useRef(true);

  // keep last 2 GPS fixes for interpolation
  const fixQueue = useRef<{ lat: number; lng: number; time: number }[]>([]);

  // ---- initialize marker and live segment ----
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

    if (!liveSegmentRef.current) {
      const seg = L.polyline([], { color: '#007bff', weight: 4, opacity: 0.9 }).addTo(map);
      liveSegmentRef.current = seg;
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
        fixQueue.current.push({ lat: coords[0], lng: coords[1], time: now });
        if (fixQueue.current.length > 2) fixQueue.current.shift(); // keep 2

        setPath(p => [...p, coords]);

        if (followMarkerRef.current && mapRef.current && !isUserPanned) {
          mapRef.current.setView(coords, mapRef.current.getZoom(), { animate: true });
        }
      },
      err => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watch);
    };
  }, [hasMounted, isUserPanned]);

  // ---- 60FPS interpolation loop ----
  useEffect(() => {
    if (!hasMounted) return undefined;
    let raf: number;

    const loop = () => {
      const q = fixQueue.current;
      if (q.length >= 1) {
        let lat = q[q.length - 1].lat;
        let lng = q[q.length - 1].lng;

        if (q.length === 2) {
          const [p1, p2] = q;
          const now = Date.now();
          const t = Math.min((now - p1.time) / (p2.time - p1.time), 1);
          lat = p1.lat + (p2.lat - p1.lat) * t;
          lng = p1.lng + (p2.lng - p1.lng) * t;
        }

        // move marker
        markerRef.current?.setLatLng([lat, lng]);

        // move tooltip
        if (tooltipRef.current && mapRef.current) {
          const pt = mapRef.current.latLngToContainerPoint(L.latLng(lat, lng));
          tooltipRef.current.style.transform = `translate(${pt.x - 40}px, ${pt.y - 60}px)`;
        }

        // draw live segment
        if (liveSegmentRef.current && path.length > 0) {
          const lastPoint = path[path.length - 1];
          liveSegmentRef.current.setLatLngs([lastPoint, [lat, lng]]);
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasMounted, path.length]);

  // ---- mount flag ----
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ---- manual pan detection (fixed TS type) ----
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

  if (!hasMounted) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );
  }

  const currentCenter =
    fixQueue.current.length > 0
      ? [fixQueue.current[fixQueue.current.length - 1].lat, fixQueue.current[fixQueue.current.length - 1].lng]
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
            <Polyline positions={path} pathOptions={{ color: '#808080', weight: 4, opacity: 0.9 }} />
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

      {/* floating tooltip */}
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
