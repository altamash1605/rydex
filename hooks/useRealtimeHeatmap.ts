// hooks/useRealtimeHeatmap.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type HeatPoint = { lat: number; lng: number; ts: number; w?: number };

// --- Grid key (~200 m). Make identical cells collapse to ONE point.
function gridKey(lat: number, lng: number, step = 0.002) {
  const roundTo = (v: number) => Math.round(v / step) * step;
  const rlat = Number(roundTo(lat).toFixed(6));
  const rlng = Number(roundTo(lng).toFixed(6));
  return `${rlat},${rlng}`;
}

// one point per tile, with gentle weight by unique drivers (no dot-multiplication)
function tileToPoint(avgLat: number, avgLng: number, drivers?: number): HeatPoint {
  // 1→~1.0, 2→~1.6, 4→~2.0, 8→~2.5 (cap 3)
  const w = drivers && drivers > 0 ? Math.min(3, 1 + Math.log2(drivers)) : 1;
  return { lat: avgLat, lng: avgLng, ts: Date.now(), w };
}

// --- Tunables
const MAX_POINTS = 400;
const NEAR_LOOKBACK_S = 60;
const FETCH_NEAR_MS = 3_000;
const PROJECT_REF = "vuymzcnkhzhjuykrfavy";
const FN_READ = `https://${PROJECT_REF}.functions.supabase.co/get_heat_tiles`;

const FETCH_AGG_MS = 10_000;
const LOOKBACK_MIN = 20;

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
          headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          tiles: { lat: number; lng: number; drivers: number; driver_id?: string }[];
        };
        if (!mounted || !data?.ok) return;

        const now = Date.now();
        const myId = getDriverIdForWeb();

        // --- temporary containers for deduplication ---
        const seenDrivers = new Set<string>();
        const byCell: Record<string, HeatPoint> = {};

        // backend tiles → one point per grid cell, weighted by unique drivers
        for (const t of data.tiles ?? []) {
          if (
            typeof t.lat !== "number" ||
            typeof t.lng !== "number" ||
            typeof t.drivers !== "number"
          )
            continue;

          const driverId = (t as any).driver_id ?? `anon_${Math.random()}`;
          const key = gridKey(t.lat, t.lng);
          const myCell = position ? gridKey(position.lat, position.lng) : null;

          // 🚫 skip my own, same-cell, and duplicate drivers
          if (driverId === myId || (myCell && key === myCell)) continue;
          if (seenDrivers.has(driverId)) continue; // ✅ one per driver per cell
          seenDrivers.add(driverId);

          byCell[key] = tileToPoint(t.lat, t.lng, t.drivers);
        }

        // 🧭 do NOT add our own position locally (avoids self-hotspot)
        const SHOW_SELF = false;
        if (SHOW_SELF && position?.lat && position?.lng) {
          const key = gridKey(position.lat, position.lng);
          byCell[key] = { lat: position.lat, lng: position.lng, ts: now, w: 0.6 };
        }

        // (optional) send a web ping (still keeps backend data accurate)
        try {
          const { Capacitor } = await import("@capacitor/core").catch(() => ({ Capacitor: null as any }));
          const isNative = !!Capacitor?.isNativePlatform?.();
          if (!isNative && position?.lat && position?.lng) {
            if (now - lastWebSend > 5000) {
              lastWebSend = now;
              const { sendDriverPing } = await import("@/utils/edge");
              await sendDriverPing({
                driver_id: myId,
                lat: position.lat,
                lng: position.lng,
                accuracy: undefined,
              });
            }
          }
        } catch {
          // ignore errors
        }

        const frame = Object.values(byCell).slice(-MAX_POINTS);
        setPoints(frame);
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

        const byCell: Record<string, HeatPoint> = {};
        for (const row of data ?? []) {
          const { avg_lat, avg_lng, driver_count } = row as any;
          if (
            typeof avg_lat !== "number" ||
            typeof avg_lng !== "number" ||
            typeof driver_count !== "number"
          )
            continue;
          const key = gridKey(avg_lat, avg_lng);
          byCell[key] = tileToPoint(avg_lat, avg_lng, driver_count);
        }
        setPoints(Object.values(byCell).slice(-MAX_POINTS));
      } finally {
        fetchingAgg.current = false;
      }
    }

    // Kickoff + polling loops
    fetchNearLive();
    const nearTimer = setInterval(fetchNearLive, FETCH_NEAR_MS);
    const aggTimer = setInterval(fetchAnalytics, FETCH_AGG_MS);

    return () => {
      mounted = false;
      clearInterval(nearTimer);
      clearInterval(aggTimer);
    };
  }, [position?.lat, position?.lng]);

  const heatPoints = points.map(p => ({ lat: p.lat, lng: p.lng, w: p.w ?? 1 }));

  return { points: heatPoints };
}
