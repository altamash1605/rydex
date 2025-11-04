'use client';

import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { useRealtimeHeatmap } from '@/hooks/useRealtimeHeatmap';
import { useGeoTracker } from './useGeoTracker';
import { useEffect, useState, useMemo } from 'react';

type HeatPoint = { lat: number; lng: number; w?: number };

export default function DriverHeatmap() {
  const { currentPos } = useGeoTracker();

  // current position → readable object
  const position =
    currentPos?.current && Array.isArray(currentPos.current)
      ? { lat: currentPos.current[0], lng: currentPos.current[1] }
      : undefined;

  // points now include optional weight `w` from the hook
  const { points } = useRealtimeHeatmap(position);

  // 🔥 fade out softly when no drivers visible
  const [visiblePoints, setVisiblePoints] = useState<HeatPoint[]>(points as HeatPoint[]);

  useEffect(() => {
    if (!points.length) {
      const timeout = setTimeout(() => setVisiblePoints([]), 1500);
      return () => clearTimeout(timeout);
    }
    setVisiblePoints(points as HeatPoint[]);
  }, [points]);

  // 🧠 memoize props so HeatmapLayer re-draws only when data changes
  const heatmapProps = useMemo(
    () => ({
      points: visiblePoints,
      latitudeExtractor: (p: HeatPoint) => p.lat,
      longitudeExtractor: (p: HeatPoint) => p.lng,

      // ✅ use backend weight (unique drivers per tile) without inflating dots
      // clamp to [0.3, 3] so singles are visible but never overpower
      intensityExtractor: (p: HeatPoint) => {
        const w = p.w ?? 1;
        return Math.max(0.3, Math.min(3, w));
      },

      // 📏 radius/blur tuned for ±50 m visual spread at city zoom
      radius: 45,   // px
      blur: 40,     // px
      max: 3.0,     // matches our clamp above
      minOpacity: 0.15,

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
