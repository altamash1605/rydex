// hooks/useRealtimeHeatmap.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type HeatPoint = { lat: number; lng: number; ts: number };

// Small random jitter (~±0.0005° ≈ ±50 m)
function jitterCoord(value: number) {
  const jitter = (Math.random() - 0.5) * 0.001; // ±0.0005°
  return value + jitter;
}

// Settings
const EXPIRY_MS = 15000;        // remove after 15 s
const CLEANUP_INTERVAL = 5000;  // prune expired points every 5 s
const FETCH_INTERVAL = 5000;    // poll aggregated tiles every 5 s
const LOOKBACK_MIN = 20;        // fetch analytics rows from last N minutes
const MAX_POINTS = 300;         // cap rendered points (after expansion)

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // 🟡 Helper: expand one aggregated tile into N jittered points
    function expandTile(avgLat: number, avgLng: number, driverCount: number) {
      // Cap how many points we synthesize per tile to avoid overdraw
      const n = Math.min(Math.max(driverCount, 1), 6);
      const out: HeatPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < n; i++) {
        out.push({
          lat: jitterCoord(avgLat),
          lng: jitterCoord(avgLng),
          ts: now,
        });
      }
      return out;
    }

    // 🟢 Poll aggregated analytics (last LOOKBACK_MIN minutes)
    async function fetchAggregated() {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const sinceISO = new Date(Date.now() - LOOKBACK_MIN * 60_000).toISOString();
        const { data, error } = await supabase
          .from("driver_analytics")
          .select("avg_lat, avg_lng, driver_count, window_end")
          .gte("window_end", sinceISO)
          .order("window_end", { ascending: false })
          .limit(2000); // cheap guard

        if (error) {
          // Soft-fail: keep previous points
          console.warn("fetchAggregated error:", error.message);
          return;
        }

        const now = Date.now();
        const synthesized: HeatPoint[] = [];

        // Expand each aggregated row into a few display points
        for (const row of data ?? []) {
          const { avg_lat, avg_lng, driver_count } = row as any;
          if (
            typeof avg_lat !== "number" ||
            typeof avg_lng !== "number" ||
            typeof driver_count !== "number"
          ) continue;

          synthesized.push(...expandTile(avg_lat, avg_lng, driver_count));
        }

        // Optionally blend in *my* current position so user sees themselves
        if (position?.lat && position?.lng) {
          synthesized.push({
            lat: jitterCoord(position.lat),
            lng: jitterCoord(position.lng),
            ts: now,
          });
        }

        // Merge with existing, drop expired, de-dup-ish, cap size
        setPoints((prev) => {
          const combined = [...prev, ...synthesized];
          const fresh = combined.filter((p) => now - p.ts < EXPIRY_MS);

          // Simple spatial de-dupe on ~5th-decimal grid
          const uniq: Record<string, HeatPoint> = {};
          for (const p of fresh) {
            uniq[`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`] = p;
          }
          return Object.values(uniq).slice(-MAX_POINTS);
        });
      } finally {
        fetchingRef.current = false;
      }
    }

    // Kick off polling
    const poll = setInterval(fetchAggregated, FETCH_INTERVAL);
    // Initial fetch for fast paint
    fetchAggregated();

    // 🧹 Cleanup old points occasionally
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setPoints((prev) => prev.filter((p) => now - p.ts < EXPIRY_MS));
    }, CLEANUP_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(poll);
      clearInterval(cleanupInterval);
    };
  }, [position?.lat, position?.lng]);

  // Strip timestamps for map rendering
  const heatPoints = points.map((p) => ({ lat: p.lat, lng: p.lng }));

  return { points: heatPoints };
}
