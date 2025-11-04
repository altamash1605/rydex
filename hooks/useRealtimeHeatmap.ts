import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HeatPoint = { lat: number; lng: number };

// Round coords for privacy (~1 km precision)
function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Avoid recreating the channel on every render
    if (!channelRef.current) {
      channelRef.current = supabase.channel("driver_heat");

      channelRef.current.on("broadcast", { event: "ping" }, (payload) => {
        const point = payload.payload as HeatPoint;

        setPoints((prev) => {
          // ✅ Avoid duplicates and keep list short (max 100 points)
          const key = `${point.lat},${point.lng}`;
          const has = prev.some((p) => `${p.lat},${p.lng}` === key);
          const updated = has ? prev : [...prev, point];
          return updated.slice(-100);
        });

        // Debug log
        console.log("📥 received heat ping:", point);
      });

      channelRef.current.subscribe((status) =>
        console.log("📡 Supabase channel status:", status)
      );
    }

    const channel = channelRef.current;

    // Broadcast my own location every 5 s
    const interval = setInterval(() => {
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

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
      channel?.unsubscribe();
      channelRef.current = null;
    };
  }, [position?.lat, position?.lng]);

  return { points };
}
