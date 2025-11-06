'use client';

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useMap } from 'react-leaflet';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';

// Render squares (tiles) instead of disks
const Rectangle = dynamic(() => import('react-leaflet').then(m => m.Rectangle), { ssr: false });

type HeatPoint = { lat: number; lng: number; w?: number };

/** same rounding as your gridKey: ~200 m tiles (0.002°) */
function roundToStep(value: number, step = 0.002) {
  return Math.round(value / step) * step;
}

/** bounds for a tile centered at the rounded lat/lng */
function tileBoundsForPoint(lat: number, lng: number, step = 0.002) {
  const cLat = roundToStep(lat, step);
  const cLng = roundToStep(lng, step);
  const half = step / 2;
  // Leaflet expects [southWest, northEast]
  return [
    [cLat - half, cLng - half],
    [cLat + half, cLng + half],
  ] as [[number, number], [number, number]];
}

export default function DriverHeatmap() {
  const { currentPos } = useGeoTracker();

  // current position → object (if your hook filters by proximity)
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  // snapshot-based, persistent points (lat,lng,w) from your patched hook
  const { points } = useRealtimeHeatmap(position);

  // Ensure our dedicated pane exists (so tiles sit under markers, above tiles)
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (!map.getPane('pane-heat')) {
      map.createPane('pane-heat');
      const pane = map.getPane('pane-heat')!;
      pane.classList.add('pane-heat'); // CSS sets z-index & pointer-events
      pane.style.pointerEvents = 'none';
    }
  }, [map]);

  // Style: very low opacity; intensity grows with driver count (w)
  const baseAlpha = 0.05; // single-driver very subtle
  const stepAlpha = 0.12; // added per (w-1)
  const maxAlpha  = 0.40; // cap

  // Optional: if you want larger/smaller tiles, change STEP here (keep this
  // in sync with backend/server aggregation step if you change it).
  const STEP_DEG = 0.002; // ≈ 200–225 m in latitude; longitude shrinks by cos(lat)

  const tiles = useMemo(() => {
    if (!points?.length) return [];
    return points.map((p, idx) => {
      const w = Math.max(1, Math.min(4, p.w ?? 1)); // clamp 1..4
      const alpha = Math.min(maxAlpha, baseAlpha + (w - 1) * stepAlpha);
      const bounds = tileBoundsForPoint(p.lat, p.lng, STEP_DEG);
      return {
        key: `${bounds[0][0]},${bounds[0][1]}:${idx}`,
        bounds,
        alpha,
      };
    });
  }, [points]);

  if (!tiles.length) return null;

  return (
    <>
      {tiles.map((t) => (
        <Rectangle
          key={t.key}
          bounds={t.bounds}
          pane="pane-heat"
          pathOptions={{
            stroke: false,            // pure fill
            fill: true,
            fillColor: '#ff6a00',     // warm monotone
            fillOpacity: t.alpha,     // intensity by drivers
          }}
        />
      ))}
    </>
  );
}
