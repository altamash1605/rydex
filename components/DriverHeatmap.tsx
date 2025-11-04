'use client';

import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';
import { useEffect, useState, useMemo } from 'react';

export default function DriverHeatmap() {
  const { currentPos } = useGeoTracker();

  // current position → readable object
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  const { points } = useRealtimeHeatmap(position);

  // 🔥 local fade-out when few points remain
  const [visiblePoints, setVisiblePoints] = useState(points);

  useEffect(() => {
    if (!points.length) {
      const timeout = setTimeout(() => setVisiblePoints([]), 1500);
      return () => clearTimeout(timeout);
    }
    setVisiblePoints(points);
  }, [points]);

  // 🧠 memoize props so HeatmapLayer only re-draws when data truly changes
  const heatmapProps = useMemo(
    () => ({
      points: visiblePoints,
      latitudeExtractor: (p: { lat: number; lng: number }) => p.lat,
      longitudeExtractor: (p: { lat: number; lng: number }) => p.lng,
      intensityExtractor: () => 0.35,   // slightly softer per driver
      radius: 25,                       // smaller radius = less GPU load
      blur: 25,                         // smoother + faster blending
      max: 4,
      minOpacity: 0.12,
      gradient: {
        0.0: 'rgba(255, 80, 0, 0)',
        0.5: 'rgba(255, 80, 0, 0.4)',
        1.0: 'rgba(255, 80, 0, 1.0)',
      },
    }),
    [visiblePoints]
  );

  if (!visiblePoints.length) return null;

  return <HeatmapLayer {...heatmapProps} />;
}
