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

  // 🔹 Smooth transition for marker
  const moveMarkerSmooth = (from: [number, number], to: [number, number]) => {
    let progress = 0;
    const step = () => {
      progress += 0.2;
      const lat = from[0] + (to[0] - from[0]) * progress;
      const lng = from[1] + (to[1] - from[1]) * progress;
      circleRef.current?.setLatLng([lat, lng]);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const lastPathPoint = useRef<[number, number] | null>(null);
  const updatePath = (pos: [number, number]) => {
    const last = lastPathPoint.current;
    if (!polyRef.current) return;
    if (!last) {
      polyRef.current.addLatLng(pos);
      lastPathPoint.current = pos;
      return;
    }
    const dist = L.latLng(last).distanceTo(pos);
    if (dist > 2) {
      moveMarkerSmooth(last, pos);
      polyRef.current.addLatLng(pos);
      lastPathPoint.current = pos;
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const stopFollow = () => {
      followMarkerRef.current = false;
      isUserPannedRef.current = true;
    };

    map.on('dragstart', stopFollow);
    return () => {
      map.off('dragstart', stopFollow);
    };
  }, []);

  return { mapRef, initLayers, updatePath, followMarkerRef, isUserPannedRef };
}
