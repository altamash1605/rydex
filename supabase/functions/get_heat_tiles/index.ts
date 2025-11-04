// supabase/functions/get_heat_tiles/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return bad("Use GET", 405);

  // Lookback window: default 120s, clamp 10..600s
  const url = new URL(req.url);
  const lookback = Math.min(Math.max(parseInt(url.searchParams.get("s") ?? "120", 10), 10), 600);
  const sinceISO = new Date(Date.now() - lookback * 1000).toISOString();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "public" } });

  // Pull recent pings (we’ll aggregate in code as: unique driver per tile)
  const { data, error } = await supabase
    .from("driver_pings")
    .select("driver_id, area_key, lat, lng, inserted_at")
    .gte("inserted_at", sinceISO)
    .order("inserted_at", { ascending: false }) // newest first so we keep the latest per driver/tile
    .limit(5000);

  if (error) return bad(`DB read failed: ${error.message}`, 500);

  // Aggregate: for each tile, keep only ONE ping per driver (latest), then average lat/lng
  type Row = { driver_id: string; area_key: string; lat: number; lng: number; inserted_at: string };
  const perTile = new Map<
    string,
    { byDriver: Map<string, { lat: number; lng: number }>; sumLat: number; sumLng: number }
  >();

  for (const r of (data ?? []) as Row[]) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    let tile = perTile.get(r.area_key);
    if (!tile) {
      tile = { byDriver: new Map(), sumLat: 0, sumLng: 0 };
      perTile.set(r.area_key, tile);
    }
    // If we already recorded this driver in this tile, skip (we keep the newest because of order desc)
    if (tile.byDriver.has(r.driver_id)) continue;
    tile.byDriver.set(r.driver_id, { lat: r.lat, lng: r.lng });
  }

  const tiles = Array.from(perTile.entries()).map(([area_key, bucket]) => {
    let drivers = 0;
    let sumLat = 0;
    let sumLng = 0;
    for (const v of bucket.byDriver.values()) {
      drivers += 1;
      sumLat += v.lat;
      sumLng += v.lng;
    }
    const lat = drivers ? sumLat / drivers : 0;
    const lng = drivers ? sumLng / drivers : 0;
    return { tile_key: area_key, lat, lng, drivers };
  });

  return json({ ok: true, tiles, window_seconds: lookback }, 200);
});
