'use client';

import 'leaflet/dist/leaflet.css';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import SpeedHUD from './SpeedHUD';
import ButtonBar from './ButtonBar';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { currentPos, path } = useGeoTracker();
  useLeafletLayers();
  const [userPanned, setUserPanned] = useState(false);

  const markerIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
    iconAnchor: [12, 41],
  });

  // Detect manual pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMoveStart = () => setUserPanned(true);
    map.on('movestart', handleMoveStart);
    return () => {
      map.off('movestart', handleMoveStart);
    };
  }, []);

  // Auto-follow
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
    <div className="relative h-full w-full overflow-hidden bg-[#030712]">
      {/* Map layer */}
      <div className="absolute inset-0">
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
      </div>

      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(80,112,255,0.28),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32%] bg-[linear-gradient(180deg,rgba(3,7,18,0.72)_0%,rgba(3,7,18,0.15)_65%,rgba(3,7,18,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(180deg,rgba(3,7,18,0)_0%,rgba(3,7,18,0.55)_40%,rgba(3,7,18,0.92)_100%)]" />

      {/* --- Floating Overlays --- */}

      {/* Top HUD */}
      <div
        className="rydex-overlay pointer-events-none absolute inset-x-0 top-0 flex justify-center px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 1.5rem) + 1.5rem)' }}
      >
        <div className="pointer-events-auto w-full max-w-xl">
          <SpeedHUD />
        </div>
      </div>

      {/* Bottom Button */}
      <div
        className="rydex-overlay rydex-overlay-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 sm:px-6"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 18px) + clamp(1.1rem, 4vw, 1.85rem))' }}
      >
        <div className="pointer-events-auto w-full max-w-xl">
          <ButtonBar />
        </div>
      </div>

      {/* Recenter Button */}
      <div className="rydex-overlay pointer-events-auto absolute bottom-40 right-6 hidden sm:block">
        <RecenterButton mapRef={mapRef} setUserPanned={setUserPanned} />
      </div>
    </div>
  );
}
