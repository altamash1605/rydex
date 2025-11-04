// supabase/functions/update_driver_location/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

// CORS helpers (so browser fetch works without errors)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...corsHeaders } });
const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

// Simple ~200m tiling by rounding lat/lng (we can swap to H3 later)
function tileKey(lat: number, lng: number, step = 0.002) {
  const roundTo = (v: number) => Math.round(v / step) * step;
  const rlat = Number(roundTo(lat).toFixed(6));
  const rlng = Number(roundTo(lng).toFixed(6));
  return `${rlat},${rlng}`;
}

type Payload = {
  driver_id?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
};

// tunables
const RATE_LIMIT_SEC = 2;      // hard anti-spam across tiles
const DEDUP_TILE_SEC = 20;     // if same tile within this window -> skip insert (return 200)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Use POST with JSON body", 405);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const { driver_id, lat, lng, accuracy } = body ?? {};
  if (!driver_id || typeof driver_id !== "string") return bad("driver_id (uuid) required");
  if (typeof lat !== "number" || typeof lng !== "number") return bad("lat and lng must be numbers");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("lat/lng must be finite numbers");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return bad("lat/lng out of range");
  if (accuracy != null && (typeof accuracy !== "number" || accuracy < 0)) return bad("accuracy invalid");

  const area_key = tileKey(lat, lng);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "public" } });

  // 1) fetch the latest row for this driver (cheap, thanks to small table + index)
  const { data: lastRows, error: lastErr } = await supabase
    .from("driver_pings")
    .select("area_key, inserted_at")
    .eq("driver_id", driver_id)
    .order("inserted_at", { ascending: false })
    .limit(1);

  if (lastErr) return bad(`DB read failed: ${lastErr.message}`, 500);

  const nowMs = Date.now();
  const last = lastRows?.[0];

  // 2) if same tile in the last DEDUP_TILE_SEC → SKIP insert (prevents heat bias)
  if (last?.area_key === area_key && last?.inserted_at) {
    const lastMs = new Date(last.inserted_at as string).getTime();
    if (nowMs - lastMs < DEDUP_TILE_SEC * 1000) {
      return json({ ok: true, dedup: true, area_key, window_seconds: DEDUP_TILE_SEC }, 200);
    }
  }

  // 3) otherwise, still enforce a short global rate-limit (across tiles)
  if (last?.inserted_at) {
    const lastMs = new Date(last.inserted_at as string).getTime();
    if (nowMs - lastMs < RATE_LIMIT_SEC * 1000) {
      return bad("Too many updates for this driver (slow down)", 429);
    }
  }

  // 4) insert a fresh ping
  const { error: insErr } = await supabase.from("driver_pings").insert({
    driver_id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    area_key,
  });

  if (insErr) return bad(`DB insert failed: ${insErr.message}`, 500);

  return json({ ok: true, dedup: false, area_key }, 200);
});
