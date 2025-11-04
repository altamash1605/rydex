import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HeatPoint = { lat: number; lng: number; ts: number }; // include timestamp

// Round coords for privacy (~1 km precision)
function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

// points expire if not updated recently
const EXPIRY_MS = 15000; // 15 seconds

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Create channel only once
    if (!channelRef.current) {
      channelRef.current = supabase.channel("driver_heat");

      channelRef.current.on("broadcast", { event: "ping" }, (payload) => {
        const incoming = payload.payload as { lat: number; lng: number };
        const now = Date.now();
        const point: HeatPoint = { ...incoming, ts: now };

        setPoints((prev) => {
          // Filter out duplicates & expired points
          const key = `${point.lat},${point.lng}`;
          const fresh = prev.filter(
            (p) =>
              Date.now() - p.ts < EXPIRY_MS && `${p.lat},${p.lng}` !== key
          );
          return [...fresh, point];
        });

        console.log("📥 received heat ping:", point);
      });

      channelRef.current.subscribe((status) =>
        console.log("📡 Supabase channel status:", status)
      );
    }

    const channel = channelRef.current;

    // 🔁 Broadcast my position every 5 seconds
    const sendInterval = setInterval(() => {
      if (!position) return;
      const rounded = {
        lat: roundCoord(position.lat),
        lng: roundCoord(position.lng),
      };
      channel
        ?.send({ type: "broadcast", event: "ping", payload: rounded })
        .catch((err) => console.warn("Supabase send error:", err));
      console.log("📤 sending heat ping:", rounded);
    }, 5000);

    // 🧹 Remove old/expired points regularly
    const cleanupInterval = setInterval(() => {
      setPoints((prev) => prev.filter((p) => Date.now() - p.ts < EXPIRY_MS));
    }, 3000);

    // 🧼 Cleanup on unmount
    return () => {
      clearInterval(sendInterval);
      clearInterval(cleanupInterval);
      channel?.unsubscribe();
      channelRef.current = null;
    };
  }, [position?.lat, position?.lng]);

  // Strip timestamps for the map layer
  const heatPoints = points.map((p) => ({ lat: p.lat, lng: p.lng }));

  return { points: heatPoints };
}
