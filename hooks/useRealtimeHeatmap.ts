// hooks/useRealtimeHeatmap.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type HeatPoint = { lat: number; lng: number; ts: number; w?: number };

// --- Small random jitter (~±0.0005° ≈ ±50 m) just for *my* blended position
function jitterCoord(value: number) {
  const jitter = (Math.random() - 0.5) * 0.001; // ±0.0005°
  return value + jitter;
}

// --- One point per tile, with a gentle weight by unique drivers (no dot-multiplication)
function tileToPoint(avgLat: number, avgLng: number, drivers?: number): HeatPoint {
  // 1 driver → ~1.0, 2 → ~1.6, 4 → ~2.0, 8 → ~2.5 (capped to 3)
  const w = drivers && drivers > 0 ? Math.min(3, 1 + Math.log2(drivers)) : 1;
  return { lat: avgLat, lng: avgLng, ts: Date.now(), w };
}

// --- Tunables
const EXPIRY_MS = 15_000;        // drop points after 15s
const CLEANUP_INTERVAL = 5_000;  // prune every 5s
const MAX_POINTS = 400;          // cap total points rendered

// Near-live (via Edge Function returning unique drivers per tile)
const NEAR_LOOKBACK_S = 20;
const FETCH_NEAR_MS = 3_000;     // poll near-live every 3s
const PROJECT_REF = "vuymzcnkhzhjuykrfavy";
const FN_READ = `https://${PROJECT_REF}.functions.supabase.co/get_heat_tiles`;

// Analytics (from driver_analytics)
const FETCH_AGG_MS = 10_000;     // poll analytics every 10s
const LOOKBACK_MIN = 20;         // read last 20 minutes of analytics rows

// --- WEB WRITER HELPERS (adds browser pings every ~5s; native uses BG plugin)
let lastWebSend = 0;
function getDriverIdForWeb(): string {
  const KEY = "rydex_driver_id";
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.localStorage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(KEY, id);
  return id;
}

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const fetchingNear = useRef(false);
  const fetchingAgg = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function fetchNearLive() {
      if (fetchingNear.current) return;
      fetchingNear.current = true;
      try {
        const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
        const url = `${FN_READ}?s=${NEAR_LOOKBACK_S}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${ANON}`,
            apikey: ANON,
          },
        });
        if (!res.ok) return; // soft fail
        const data = (await res.json()) as {
          ok: boolean;
          tiles: { lat: number; lng: number; drivers: number }[];
        };
        if (!mounted || !data?.ok) return;

        const now = Date.now();
        const fresh: HeatPoint[] = [];

        // one dot per tile, with weight by unique drivers
        for (const t of data.tiles ?? []) {
          if (typeof t.lat !== "number" || typeof t.lng !== "number" || typeof t.drivers !== "number") continue;
          fresh.push(tileToPoint(t.lat, t.lng, t.drivers));
        }

        // Blend my current position lightly so it feels live (weight < 1)
        if (position?.lat && position?.lng) {
          fresh.push({ lat: jitterCoord(position.lat), lng: jitterCoord(position.lng), ts: now, w: 0.6 });
        }

        // --- WEB WRITER: send a ping from the browser every ~5s (native already writes)
        try {
          const { Capacitor } = await import("@capacitor/core").catch(() => ({ Capacitor: null as any }));
          const isNative = !!Capacitor?.isNativePlatform?.();
          if (!isNative && position?.lat && position?.lng) {
            if (now - lastWebSend > 5000) {
              lastWebSend = now;
              const { sendDriverPing } = await import("@/utils/edge");
              await sendDriverPing({
                driver_id: getDriverIdForWeb(),
                lat: position.lat,
                lng: position.lng,
                accuracy: undefined,
              });
            }
          }
        } catch {
          // ignore web send errors
        }

        // Merge, drop expired, sparse-dedupe, cap
        setPoints(prev => {
          const combined = [...prev, ...fresh];
          const recent = combined.filter(p => now - p.ts < EXPIRY_MS);

          const uniq: Record<string, HeatPoint> = {};
          for (const p of recent) {
            // ~5th-decimal cell de-dupe
            uniq[`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`] = p;
          }
          return Object.values(uniq).slice(-MAX_POINTS);
        });
      } finally {
        fetchingNear.current = false;
      }
    }

    async function fetchAnalytics() {
      if (fetchingAgg.current) return;
      fetchingAgg.current = true;
      try {
        const sinceISO = new Date(Date.now() - LOOKBACK_MIN * 60_000).toISOString();
        const { data, error } = await supabase
          .from("driver_analytics")
          .select("avg_lat, avg_lng, driver_count, window_end")
          .gte("window_end", sinceISO)
          .order("window_end", { ascending: false })
          .limit(2000);

        if (error) return;

        const now = Date.now();
        const fresh: HeatPoint[] = [];
        for (const row of data ?? []) {
          const { avg_lat, avg_lng, driver_count } = row as any;
          if (typeof avg_lat !== "number" || typeof avg_lng !== "number" || typeof driver_count !== "number") continue;
          // one dot per analytics tile, weighted by driver_count
          fresh.push(tileToPoint(avg_lat, avg_lng, driver_count));
        }

        setPoints(prev => {
          const combined = [...prev, ...fresh];
          const recent = combined.filter(p => now - p.ts < EXPIRY_MS);

          const uniq: Record<string, HeatPoint> = {};
          for (const p of recent) {
            uniq[`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`] = p;
          }
          return Object.values(uniq).slice(-MAX_POINTS);
        });
      } finally {
        fetchingAgg.current = false;
      }
    }

    // Kickoff + polling loops
    fetchNearLive();
    fetchAnalytics();

    const nearTimer = setInterval(fetchNearLive, FETCH_NEAR_MS);
    const aggTimer = setInterval(fetchAnalytics, FETCH_AGG_MS);

    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      setPoints(prev => prev.filter(p => now - p.ts < EXPIRY_MS));
    }, CLEANUP_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(nearTimer);
      clearInterval(aggTimer);
      clearInterval(cleanupTimer);
    };
  }, [position?.lat, position?.lng]);

  // Return weights to the renderer (so heat layer can use intensity)
  const heatPoints = points.map(p => ({ lat: p.lat, lng: p.lng, w: p.w ?? 1 }));

  return { points: heatPoints };
}
