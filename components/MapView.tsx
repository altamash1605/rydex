'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then((m) => ({
    default: function MapRefBinder({ onReady }: { onReady: (map: LeafletMap) => void }) {
      const map = m.useMapEvents({});
      useEffect(() => {
        if (map) onReady(map);
      }, [map, onReady]);
      return null;
    },
  }))
);

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const [path, setPath] = useState<[number, number][]>([]);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const dotRef = useRef<HTMLDivElement | null>(null);

  // --- get GPS updates ---
  useEffect(() => {
    const handlePos = (lat: number, lng: number, acc: number) => {
      setPos([lat, lng]);
      setPath((arr) => [...arr, [lat, lng]]);
      setAccuracy(acc);
      setLowAccuracy(acc > 20);
    };

    if (Capacitor.isNativePlatform()) {
      const watch = Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        (pos, err) => {
          if (err || !pos) return console.warn('Native GPS error', err);
          const { latitude, longitude, accuracy } = pos.coords;
          handlePos(latitude, longitude, accuracy);
        }
      );
      return () => {
        if (watch) Geolocation.clearWatch({ id: watch });
      };
    } else {
      const watch = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          handlePos(latitude, longitude, accuracy);
        },
        (err) => console.warn('Browser GPS error', err),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watch);
    }
  }, []);

  // --- Animate blue dot and follow ---
  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (mapRef.current && pos) {
        const pt = mapRef.current.latLngToContainerPoint(L.latLng(pos[0], pos[1]));
        if (dotRef.current) dotRef.current.style.transform = `translate(${pt.x - 10}px, ${pt.y - 10}px)`;
        if (isFollowing) mapRef.current.panTo(pos, { animate: true });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pos, isFollowing]);

  const handleRecenter = () => {
    if (mapRef.current && pos) {
      mapRef.current.flyTo(pos, mapRef.current.getZoom(), { animate: true });
      setIsFollowing(true);
    }
  };

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapContainer
          center={pos ?? [0, 0]}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <MapRefBinder onReady={(m) => (mapRef.current = m)} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        </MapContainer>
      </div>

      <div
        ref={dotRef}
        className="absolute z-[999] w-5 h-5 rounded-full bg-blue-500 border-[3px] border-white shadow-lg pointer-events-none transition-transform duration-75 ease-out"
      />
      {lowAccuracy && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm animate-pulse">
          GPS accuracy low ({accuracy?.toFixed(0)} m)
        </div>
      )}
      <RecenterButton onClick={handleRecenter} visible />
    </div>
  );
}
