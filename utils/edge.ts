// utils/edge.ts
// Tiny helper to call the Edge Function we deployed.
// Usage:
//   import { sendDriverPing } from "@/utils/edge";
//   await sendDriverPing({ driver_id, lat, lng, accuracy });

export type DriverPing = {
  driver_id: string;   // UUID
  lat: number;
  lng: number;
  accuracy?: number;
};

// Put your project ref once so you don't repeat it everywhere
const PROJECT_REF = "vuymzcnkhzhjuykrfavy"; // <- keep this as-is for your project
const FN_URL = `https://${PROJECT_REF}.functions.supabase.co/update_driver_location`;

// You can keep ANON in env if you prefer: NEXT_PUBLIC_SUPABASE_ANON_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function sendDriverPing(payload: DriverPing) {
  if (!ANON) {
    console.warn("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in env");
  }

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The Edge Function accepts anon tokens (JWT off). This makes CORS happy.
      Authorization: `Bearer ${ANON ?? ""}`,
    },
    body: JSON.stringify(payload),
  });

  // Basic error surface for early debugging
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok || (data && data.ok === false)) {
    throw new Error(
      `sendDriverPing failed (${res.status}): ` +
      (data?.error ?? text ?? "unknown error")
    );
  }
  return data; // { ok: true, area_key: "..." }
}
