'use client';

import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';

export default function DriverHeatmap() {
  // Get the current GPS position from your location store
  const { currentPos } = useGeoTracker();

  // Convert from LatLng tuple ([lat, lng]) to an object for readability
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  // Get all live driver positions from Supabase
  const { points } = useRealtimeHeatmap(position);

  if (!points.length) return null; // nothing to draw yet

  return (
    <HeatmapLayer
      points={points}
      // Explicitly type `p` so TS knows what it is
      latitudeExtractor={(p: { lat: number; lng: number }) => p.lat}
      longitudeExtractor={(p: { lat: number; lng: number }) => p.lng}
      intensityExtractor={() => 1}
    />
  );
}
