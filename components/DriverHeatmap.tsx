'use client';

import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';

export default function DriverHeatmap() {
  const { currentPos } = useGeoTracker();

  // Convert from LatLng tuple ([lat, lng]) to an object for readability
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  const { points } = useRealtimeHeatmap(position);

  if (!points.length) return null;

  return (
    <HeatmapLayer
      points={points}
      latitudeExtractor={(p: { lat: number; lng: number }) => p.lat}
      longitudeExtractor={(p: { lat: number; lng: number }) => p.lng}
      // 🌤️ Softer single-driver glow
      intensityExtractor={() => 0.35}  // lower = less “hot” (0.2–0.5 recommended)
      radius={25}                      // wider spread of the glow
      blur={30}                        // smooth feathered edges
      max={3}                          // prevents early saturation (more control)
      minOpacity={0.2}                 // subtle baseline glow even when faint
      gradient={{
        0.0: 'rgba(0, 0, 255, 0)',     // transparent blue at outer edges
        0.4: 'rgba(0, 255, 255, 0.4)', // soft cyan
        0.6: 'rgba(255, 255, 0, 0.6)', // warm yellow
        0.8: 'rgba(255, 165, 0, 0.7)', // orange core
        1.0: 'rgba(255, 69, 0, 0.8)',  // soft red center
      }}
    />
  );
}
