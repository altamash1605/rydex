'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import RecenterButton from './RecenterButton';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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
  const { initLayers, updateDot, updatePath } = useLeafletLayers();

  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (currentPos.current) {
        updateDot(currentPos.current);
        updatePath(currentPos.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [updateDot, updatePath, currentPos]);

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
      <RecenterButton visible={true} />
    </div>
  );
}
