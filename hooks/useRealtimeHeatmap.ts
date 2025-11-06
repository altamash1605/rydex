import { useEffect, useRef, useState } from "react";

type HeatPoint = { lat: number; lng: number; w?: number; ts?: number };
type StoreItem = { lat: number; lng: number; w: number; lastSeen: number };

/** ~200 m grid so identical tiles collapse to one point */
function gridKey(lat: number, lng: number, step = 0.002) {
  const roundTo = (v: number) => Math.round(v / step) * step;
  const rlat = Number(roundTo(lat).toFixed(6));
  const rlng = Number(roundTo(lng).toFixed(6));
  return `${rlat},${rlng}`;
}

/** weight from unique drivers in a tile: 1 + log2(drivers), capped */
function weightFromDrivers(drivers?: number) {
  const d = Math.max(1, drivers ?? 1);
  return Math.min(4, 1 + Math.log2(d)); // 1..4
}

/* ================== Tunables (snapshot mode + persistence) ================== */
const AGG_WINDOW_S     = 20;     // server aggregates last 20s
const AGG_INTERVAL_MS  = 5000;   // fetch every 5s
const HOLD_MS          = 60_000; // keep a tile visible up to 60s since last seen
const MAX_POINTS       = 400;    // safety cap

// Supabase Edge Function endpoint (with a safe fallback ref)
const PROJECT_REF =
  process.env.NEXT_PUBLIC_SUPABASE_REF?.trim() ||
  "vuymzcnkhzhjuykrfavy"; // fallback like your older code
const FN_READ = `https://${PROJECT_REF}.functions.supabase.co/get_heat_tiles`;
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

/** log no more than once per minute */
const shouldLog = (() => {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last > 60_000) {
      last = now;
      return true;
    }
    return false;
  };
})();

/**
 * Snapshot-only heatmap with persistence:
 * - Fetch aggregated tiles for the last AGG_WINDOW_S seconds every AGG_INTERVAL_MS
 * - Maintain a store keyed by ~200m tile with { lastSeen, w }
 * - Publish tiles whose lastSeen ≤ HOLD_MS (prevents blinking on empty snapshots or hiccups)
 */
export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const mountedRef = useRef(true);

  // persistent tile store: key -> { lat, lng, w, lastSeen }
  const storeRef = useRef<Record<string, StoreItem>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;

    async function fetchSnapshot() {
      try {
        const url =
          `${FN_READ}?s=${AGG_WINDOW_S}` +
          (position ? `&lat=${position.lat}&lng=${position.lng}` : "");

        const headers: Record<string, string> = {};
        if (ANON) {
          headers.Authorization = `Bearer ${ANON}`;
          headers.apikey = ANON;
        }

        if (shouldLog()) {
          console.debug("[heat] snapshot fetch →", { url, hasAnon: Boolean(ANON) });
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          if (shouldLog()) console.debug("[heat] snapshot non-OK:", res.status);
          publishFromStore(); // still publish what we have
          return;
        }
        const data = await res.json();
        const tiles: Array<{ lat: number; lng: number; drivers?: number }> =
          Array.isArray(data?.tiles) ? data.tiles : [];

        const now = Date.now();
        const store = storeRef.current;

        // Update store with fresh snapshot (keep max weight per tile)
        for (const t of tiles) {
          const key = gridKey(t.lat, t.lng);
          const w = weightFromDrivers(t.drivers);
          const cur = store[key];
          if (!cur || cur.w < w) {
            store[key] = { lat: t.lat, lng: t.lng, w, lastSeen: now };
          } else {
            // keep position stable; only refresh lastSeen
            cur.lastSeen = now;
          }
        }

        // Evict truly stale tiles (older than HOLD_MS)
        for (const [k, v] of Object.entries(store)) {
          if (now - v.lastSeen > HOLD_MS) delete store[k];
        }

        publishFromStore();
      } catch (e) {
        if (shouldLog()) console.debug("[heat] snapshot fetch failed", e);
        // On failure, do NOT clear; just republish current store
        publishFromStore();
      }
    }

    function publishFromStore() {
      const list: HeatPoint[] = Object.values(storeRef.current)
        .map((v) => ({ lat: v.lat, lng: v.lng, w: v.w, ts: v.lastSeen }))
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
        .slice(0, MAX_POINTS);
      if (shouldLog()) console.debug("[heat] publish points:", list.length);
      if (mountedRef.current) setPoints(list);
    }

    // initial + timer
    fetchSnapshot();
    timer = window.setInterval(fetchSnapshot, AGG_INTERVAL_MS);

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [position?.lat, position?.lng]);

  // DriverHeatmap only needs lat,lng,w
  return { points: points.map((p) => ({ lat: p.lat, lng: p.lng, w: p.w })) };
}
