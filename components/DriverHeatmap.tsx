'use client';

import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';
import { useEffect, useState } from 'react';

export default function DriverHeatmap() {
  const { currentPos } = useGeoTracker();

  // Convert from LatLng tuple ([lat, lng]) to an object for readability
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  const { points } = useRealtimeHeatmap(position);

  // 🔥 local fading effect: gradually reduce intensity when few points remain
  const [visiblePoints, setVisiblePoints] = useState(points);

  useEffect(() => {
    if (!points.length) {
      // fade out smoothly when no points
      const timeout = setTimeout(() => setVisiblePoints([]), 2000);
      return () => clearTimeout(timeout);
    }
    setVisiblePoints(points);
  }, [points]);

  if (!visiblePoints.length) return null;

  return (
    <HeatmapLayer
      points={visiblePoints}
      latitudeExtractor={(p: { lat: number; lng: number }) => p.lat}
      longitudeExtractor={(p: { lat: number; lng: number }) => p.lng}
      intensityExtractor={() => 0.4}   // base intensity per driver
      radius={30}                      // determines spread (increase for smoother blend)
      blur={35}                        // feathered edges
      max={4}                          // higher = slower saturation when drivers overlap
      minOpacity={0.15}                // softer base when only 1 driver
      // 🟠 single-color gradient: one color that strengthens with overlap
      gradient={{
        0.0: 'rgba(255, 80, 0, 0)',   // fully transparent
        0.5: 'rgba(255, 80, 0, 0.4)', // soft orange midtone
        1.0: 'rgba(255, 80, 0, 1.0)'  // strong orange-red core
      }}
    />
  );
}
