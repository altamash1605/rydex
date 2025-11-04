// supabase/functions/update_driver_location/index.ts

// Type defs for Supabase Edge Runtime (autocomplete, etc.)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ Injected via Supabase Edge secrets
const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function bad(msg: string, status = 400) {
  return json({ ok: false, error: msg }, status);
}

// ~200m tiling by rounding (swap to H3 later if needed)
function tileKey(lat: number, lng: number, step = 0.002) {
  const roundTo = (v: number) => Math.round(v / step) * step;
  const rlat = Number(roundTo(lat).toFixed(6));
  const rlng = Number(roundTo(lng).toFixed(6));
  return `${rlat},${rlng}`;
}

type Payload = {
  driver_id?: string; // UUID string
  lat?: number;
  lng?: number;
  accuracy?: number;
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Use POST with JSON body", 405);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const { driver_id, lat, lng, accuracy } = body ?? {};

  // Basic validation
  if (!driver_id || typeof driver_id !== "string") return bad("driver_id (uuid) required");
  if (typeof lat !== "number" || typeof lng !== "number") return bad("lat and lng must be numbers");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("lat/lng must be finite numbers");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return bad("lat/lng out of range");
  if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0)) {
    return bad("accuracy must be a non-negative number");
  }

  const area_key = tileKey(lat, lng);

  // Service-role Supabase client (server-side only)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "public" } });

  // 🔒 Per-driver rate limit: ~1 write per 2s
  const RATE_LIMIT_MS = 2000;
  const sinceISO = new Date(Date.now() - RATE_LIMIT_MS).toISOString();

  const recent = await supabase
    .from("driver_pings")
    .select("id", { head: true, count: "exact" })
    .eq("driver_id", driver_id)
    .gte("inserted_at", sinceISO);

  if ((recent.count ?? 0) > 0) {
    return bad("Too many updates for this driver (slow down)", 429);
  }

  const { error } = await supabase.from("driver_pings").insert({
    driver_id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    area_key,
  });

  if (error) {
    return bad(`DB insert failed: ${error.message}`, 500);
  }

  return json({ ok: true, area_key }, 200);
});
