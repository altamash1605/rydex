'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer   = dynamic(() => import('react-leaflet').then(m => m.TileLayer),   { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then(m => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => { if (map) onReady(map); return undefined; }, [map, onReady]);
      return null;
    },
  }))
);

export default function MapView() {
  const { path, currentPos } = useGeoTracker();
  const { initLayers, updatePath, mapRef } = useLeafletLayers();
  const [isFollowing, setIsFollowing] = useState(true);

  const dotRef = useRef<HTMLDivElement | null>(null);

  // --- Animate / update every frame ---
  useEffect(() => {
    let raf: number;
    const loop = () => {
      const pos = currentPos.current;
      const map = mapRef.current;
      if (pos && map) {
        // Update blue dot overlay position (fixed size)
        const pt = map.latLngToContainerPoint(L.latLng(pos[0], pos[1]));
        if (dotRef.current) {
          dotRef.current.style.transform = `translate(${pt.x - 10}px, ${pt.y - 10}px)`; // centered
        }

        // Update path (handled in useLeafletLayers)
        updatePath(pos);

        // Follow camera if enabled
        if (isFollowing) {
          map.panTo(pos, { animate: true, duration: 0.8 });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [updatePath, currentPos, isFollowing]);

  // --- Handle Recenter button ---
  const handleRecenter = () => {
    const map = mapRef.current;
    const pos = currentPos.current;
    if (map && pos) {
      map.flyTo(pos, map.getZoom(), { animate: true, duration: 0.8 });
      setIsFollowing(true);
    }
  };

// --- Pause follow when user manually pans ---
useEffect((): void | (() => void) => {
  const map = mapRef.current;
  if (!map) return undefined; // wait until map exists

  const stopFollow = () => {
    setIsFollowing(false);
    console.log('🛑 Follow paused — user panned map');
  };

  // Attach once
  map.on('dragstart', stopFollow);

  // Cleanup
  return () => {
    map.off('dragstart', stopFollow);
  };
}, [mapRef.current]); // ✅ depend on mapRef.current

  const center = path[path.length - 1] ?? [0, 0];

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapContainer
          center={center as [number, number]}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
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
      </div>

      {/* ✅ Fixed-size blue dot overlay */}
      <div
        ref={dotRef}
        className="absolute z-[999] w-5 h-5 rounded-full bg-blue-500 border-[3px] border-white shadow-lg pointer-events-none transition-transform duration-75 ease-out"
      />

      <RecenterButton onClick={handleRecenter} visible={true} />
    </div>
  );
}
