import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HeatPoint = { lat: number; lng: number; ts: number };

// Round coords for privacy (~1 km precision)
function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

// Expiry & batching settings
const EXPIRY_MS = 15000; // remove after 15 s
const FLUSH_INTERVAL = 2000; // apply incoming points every 2 s
const CLEANUP_INTERVAL = 5000; // prune expired points every 5 s

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const bufferRef = useRef<HeatPoint[]>([]);
  const lastSendRef = useRef(0);

  useEffect(() => {
    if (!channelRef.current) {
      const channel = supabase.channel("driver_heat");
      channelRef.current = channel;

      // Buffer incoming points instead of setting state immediately
      channel.on("broadcast", { event: "ping" }, (payload) => {
        const now = Date.now();
        const incoming = payload.payload as { lat: number; lng: number };
        bufferRef.current.push({ ...incoming, ts: now });
      });

      channel.subscribe();
    }

    const channel = channelRef.current;

    // 🟢 Broadcast my location (debounced)
    const sendInterval = setInterval(() => {
      if (!position) return;

      const now = Date.now();
      if (now - lastSendRef.current < 5000) return; // 5 s debounce
      lastSendRef.current = now;

      const rounded = {
        lat: roundCoord(position.lat),
        lng: roundCoord(position.lng),
      };

      channel
        ?.send({ type: "broadcast", event: "ping", payload: rounded })
        .catch((err) => console.warn("Supabase send error:", err));
    }, 1000);

    // 🧮 Flush buffered points to state every few seconds
    const flushInterval = setInterval(() => {
      if (!bufferRef.current.length) return;

      setPoints((prev) => {
        const combined = [...prev, ...bufferRef.current];
        bufferRef.current = [];

        // Remove expired + dedupe + cap to 100 points
        const now = Date.now();
        const unique: Record<string, HeatPoint> = {};
        for (const p of combined) {
          if (now - p.ts < EXPIRY_MS) unique[`${p.lat},${p.lng}`] = p;
        }
        return Object.values(unique).slice(-100);
      });
    }, FLUSH_INTERVAL);

    // 🧹 Cleanup old points occasionally
    const cleanupInterval = setInterval(() => {
      setPoints((prev) => prev.filter((p) => Date.now() - p.ts < EXPIRY_MS));
    }, CLEANUP_INTERVAL);

    return () => {
      clearInterval(sendInterval);
      clearInterval(flushInterval);
      clearInterval(cleanupInterval);
      channel?.unsubscribe();
      channelRef.current = null;
    };
  }, [position?.lat, position?.lng]);

  // Strip timestamps for map rendering
  const heatPoints = points.map((p) => ({ lat: p.lat, lng: p.lng }));

  return { points: heatPoints };
}
