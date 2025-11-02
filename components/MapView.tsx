'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- Dynamic imports ---
const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then((m) => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => {
        if (map) onReady(map);
        return undefined;
      }, [map, onReady]);
      return null;
    },
  }))
);

export default function MapView() {
  const { path, currentPos } = useGeoTracker();
  const { initLayers, updatePath, mapRef } = useLeafletLayers();

  const [isFollowing, setIsFollowing] = useState(true);
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const [accuracyValue, setAccuracyValue] = useState<number | null>(null);

  const dotRef = useRef<HTMLDivElement | null>(null);

  // --- Animate / update every frame ---
  useEffect(() => {
    let raf: number;
    const loop = () => {
      const pos = currentPos.current;
      const map = mapRef.current;
      if (pos && map) {
        const pt = map.latLngToContainerPoint(L.latLng(pos[0], pos[1]));
        if (dotRef.current) {
          dotRef.current.style.transform = `translate(${pt.x - 10}px, ${pt.y - 10}px)`;
        }

        updatePath(pos);

        if (isFollowing) {
          map.panTo(pos, { animate: true, duration: 0.8 });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [updatePath, currentPos, isFollowing]);

  // --- Handle Recenter button click ---
  const handleRecenter = () => {
    const map = mapRef.current;
    const pos = currentPos.current;
    if (map && pos) {
      map.flyTo(pos, map.getZoom(), { animate: true, duration: 0.8 });
      setIsFollowing(true);
      console.log('✅ Recenter enabled');
    }
  };

  // --- Disable follow when user manually pans or zooms ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const stopFollow = () => {
      if (isFollowing) {
        setIsFollowing(false);
        console.log('🛑 Follow paused — user moved map manually');
      }
    };

    map.on('dragstart', stopFollow);
    map.on('zoomstart', stopFollow);
    map.on('movestart', stopFollow);

    return () => {
      map.off('dragstart', stopFollow);
      map.off('zoomstart', stopFollow);
      map.off('movestart', stopFollow);
    };
  }, [mapRef.current, isFollowing]);

  // --- Track GPS accuracy ---
  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        setAccuracyValue(acc);
        setLowAccuracy(acc > 20);
      },
      (err) => console.warn('Accuracy watch error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const center = path[path.length - 1] ?? [0, 0];

  // ✅ Important layout fix: make the map truly fullscreen and prevent overflow
  return (
    <div className="fixed inset-0 overflow-hidden">
      <MapContainer
        center={center as [number, number]}
        zoom={15}
        zoomControl={false}
        attributionControl={false}
        className="absolute inset-0 h-full w-full"
        doubleClickZoom
        scrollWheelZoom
        dragging
      >
        <MapRefBinder onReady={initLayers} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
      </MapContainer>

      {/* Live marker dot */}
      <div
        ref={dotRef}
        className="absolute z-[999] w-5 h-5 rounded-full bg-blue-500 border-[3px] border-white shadow-lg pointer-events-none transition-transform duration-75 ease-out"
      />

      {/* GPS accuracy warning */}
      {lowAccuracy && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm animate-pulse">
          GPS accuracy low ({accuracyValue?.toFixed(0)} m)
        </div>
      )}

      {/* ✅ Recenter button now completely independent of map position */}
      <RecenterButton onClick={handleRecenter} visible={true} />
    </div>
  );
}
