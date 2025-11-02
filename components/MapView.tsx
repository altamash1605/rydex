'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import SpeedHUD from './SpeedHUD';
import ButtonBar from './ButtonBar';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { position, path } = useGeoTracker();
  const { markerIcon } = useLeafletLayers();

  const [userPanned, setUserPanned] = useState(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMoveStart = () => setUserPanned(true);
    map.on('movestart', handleMoveStart);
    return () => map.off('movestart', handleMoveStart);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && position && !userPanned) {
      map.setView([position.lat, position.lng]);
    }
  }, [position, userPanned]);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        ref={mapRef as any}
        center={[position?.lat || 0, position?.lng || 0]}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {position && (
          <Marker position={[position.lat, position.lng]} icon={markerIcon}></Marker>
        )}

        {path.length > 1 && <Polyline positions={path} color="blue" />}
      </MapContainer>

      {/* HUD - fixed top */}
      <div className="absolute top-2 left-[5px] right-[5px] z-[1000]">
        <SpeedHUD />
      </div>

      {/* Recenter Button - above ButtonBar, right side */}
      <div className="absolute bottom-24 right-4 z-[1000]">
        <RecenterButton mapRef={mapRef} setUserPanned={setUserPanned} />
      </div>

      {/* Button Bar - bottom center */}
      <div className="absolute bottom-2 left-0 right-0 z-[1000] flex justify-center">
        <ButtonBar />
      </div>
    </div>
  );
}
