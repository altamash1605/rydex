import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function useLeafletLayers() {
  const mapRef = useRef<LeafletMap | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polyRef = useRef<L.Polyline | null>(null);
  const followMarkerRef = useRef(true);
  const isUserPannedRef = useRef(false);

  const initLayers = (map: LeafletMap) => {
    mapRef.current = map;

    if (!polyRef.current) {
      polyRef.current = L.polyline([], {
        color: '#007bff',
        weight: 4,
        opacity: 0.9,
        renderer: L.canvas(),
      }).addTo(map);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle([0, 0], {
        radius: 6,
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.9,
        weight: 0,
        renderer: L.canvas(),
      }).addTo(map);
    }
  };

  const updateDot = (pos: [number, number]) => {
    circleRef.current?.setLatLng(pos);
  };

  const lastPathPoint = useRef<[number, number] | null>(null);
  const updatePath = (pos: [number, number]) => {
    const last = lastPathPoint.current;
    if (!polyRef.current) return;
    if (!last || L.latLng(last).distanceTo(pos) > 2) {
      polyRef.current.addLatLng(pos);
      lastPathPoint.current = pos;
    }
  };

  // ✅ Type-safe effect with explicit return type
  useEffect((): void | (() => void) => {
    const map = mapRef.current;
    if (!map) return undefined; // make return type explicit

    const stopFollow = () => {
      followMarkerRef.current = false;
      isUserPannedRef.current = true;
    };

    map.on('dragstart', stopFollow);
    return () => {
      map.off('dragstart', stopFollow);
    };
  }, []);

  return { mapRef, initLayers, updateDot, updatePath, followMarkerRef, isUserPannedRef };
}
