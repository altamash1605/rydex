'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import SpeedHUD from './SpeedHUD';
import ButtonBar from './ButtonBar';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- Lazy imports for React Leaflet ---
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { currentPos, path } = useGeoTracker();
  const leaflet = useLeafletLayers();
  const [userPanned, setUserPanned] = useState(false);

  // ✅ Local marker icon
  const markerIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
    iconAnchor: [12, 41],
  });

  // --- Detect manual pan ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMoveStart = () => setUserPanned(true);
    map.on('movestart', handleMoveStart);

    return () => {
      map.off('movestart', handleMoveStart);
    };
  }, []);

  // --- Auto-follow user when not manually panned ---
  useEffect(() => {
    const map = mapRef.current;
    const coords = currentPos.current;
    if (map && coords && !userPanned) {
      map.setView([coords[0], coords[1]]);
    }
  }, [currentPos.current, userPanned]);

  const lat = currentPos.current?.[0] ?? 0;
  const lng = currentPos.current?.[1] ?? 0;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* MAP LAYER */}
      <MapContainer
        ref={mapRef as any}
        center={[lat, lng]}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {currentPos.current && (
          <Marker position={[lat, lng]} icon={markerIcon}></Marker>
        )}

        {path.length > 1 && <Polyline positions={path} color="blue" />}
      </MapContainer>

      {/* --- FLOATING UI LAYER --- */}

      {/* HUD (top bar) */}
      <div className="absolute top-3 left-3 right-3 z-[1000]">
        <SpeedHUD />
      </div>

      {/* Recenter button (bottom-right corner) */}
      <div className="absolute bottom-24 right-4 z-[1000]">
        <RecenterButton mapRef={mapRef} setUserPanned={setUserPanned} />
      </div>

      {/* Bottom main action bar */}
      <div className="absolute bottom-3 left-3 right-3 z-[1000] flex justify-center">
        <ButtonBar />
      </div>
    </div>
  );
}
