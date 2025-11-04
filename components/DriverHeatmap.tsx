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

  // 🔥 fade out softly when no drivers visible
  const [visiblePoints, setVisiblePoints] = useState(points);

  useEffect(() => {
    if (!points.length) {
      const timeout = setTimeout(() => setVisiblePoints([]), 1500);
      return () => clearTimeout(timeout);
    }
    setVisiblePoints(points);
  }, [points]);

  // 🧠 memoize props so HeatmapLayer re-draws only when data changes
  const heatmapProps = useMemo(
    () => ({
      points: visiblePoints,
      latitudeExtractor: (p: { lat: number; lng: number }) => p.lat,
      longitudeExtractor: (p: { lat: number; lng: number }) => p.lng,
      intensityExtractor: () => 0.25, // softer intensity for more natural blending

      // 📏 radius/blur tuned for ±50 m visual spread at city zoom
      radius: 45,  // larger glow area (approx ±50 m visually)
      blur: 40,    // smooth fade-out at edges
      max: 3.5,    // prevents over-saturation on overlaps
      minOpacity: 0.15, // base ambient glow

      // 🔥 single-color warm gradient
      gradient: {
        0.0: 'rgba(255, 80, 0, 0)',
        0.3: 'rgba(255, 100, 0, 0.3)',
        0.6: 'rgba(255, 100, 0, 0.55)',
        1.0: 'rgba(255, 60, 0, 0.9)',
      },
    }),
    [visiblePoints]
  );

  if (!visiblePoints.length) return null;

  return <HeatmapLayer {...heatmapProps} />;
}
