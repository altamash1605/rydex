import 'leaflet/dist/leaflet.css';

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

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { currentPos, path } = useGeoTracker();
  const leaflet = useLeafletLayers();
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
    <div className="relative h-full w-full overflow-hidden bg-[#f5f5f5]">
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

      {/* Soft lighting layer to match mock */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_55%)]" />

      {/* --- Floating Overlays --- */}

      {/* Top HUD */}
      <div className="rydex-overlay pointer-events-none absolute top-6 left-0 right-0 flex justify-center px-6">
        <SpeedHUD />
      </div>

      {/* Bottom Button */}
      <div className="rydex-overlay rydex-overlay-bottom pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center px-6">
        <div className="pointer-events-auto w-full max-w-md">
          <ButtonBar />
        </div>
      </div>

      {/* Recenter Button */}
      <div className="rydex-overlay pointer-events-auto absolute bottom-36 right-6 hidden sm:block">
        <RecenterButton mapRef={mapRef} setUserPanned={setUserPanned} />
      </div>
    </div>
  );
}
