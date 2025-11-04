// supabase/functions/get_heat_tiles/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Secrets already set earlier
const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

// CORS
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...cors } });
const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

// Round ~200m tiles (same as write path)
function tileKey(lat: number, lng: number, step = 0.002) {
  const roundTo = (v: number) => Math.round(v / step) * step;
  const rlat = Number(roundTo(lat).toFixed(6));
  const rlng = Number(roundTo(lng).toFixed(6));
  return `${rlat},${rlng}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return bad("Use GET", 405);

  // Query params: lookback seconds (default 120)
  const url = new URL(req.url);
  const lookback = Math.min(Math.max(parseInt(url.searchParams.get("s") ?? "120", 10), 10), 600); // 10..600s

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "public" } });

  const sinceISO = new Date(Date.now() - lookback * 1000).toISOString();

  // Read last N seconds of live pings and aggregate per tile_key
  const { data, error } = await supabase
    .from("driver_pings")
    .select("lat,lng", { count: "exact" })
    .gte("inserted_at", sinceISO)
    .limit(5000); // guardrail

  if (error) return bad(`DB read failed: ${error.message}`, 500);

  // Aggregate into { tile_key, lat, lng, drivers }
  const buckets = new Map<string, { lat: number; lng: number; n: number }>();

  for (const row of data ?? []) {
    const lat = row.lat as number;
    const lng = row.lng as number;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const key = tileKey(lat, lng);
    const b = buckets.get(key) ?? { lat: 0, lng: 0, n: 0 };
    b.lat += lat;
    b.lng += lng;
    b.n += 1;
    buckets.set(key, b);
  }

  const tiles = Array.from(buckets.entries()).map(([key, v]) => ({
    tile_key: key,
    lat: v.lat / v.n,
    lng: v.lng / v.n,
    drivers: v.n,
  }));

  return json({ ok: true, tiles, window_seconds: lookback });
});
