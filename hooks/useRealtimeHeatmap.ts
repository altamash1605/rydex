import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // existing client

type HeatPoint = { lat: number; lng: number };

// Round coords for privacy (~1 km precision)
function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

export function useRealtimeHeatmap(position?: { lat: number; lng: number }) {
  const [points, setPoints] = useState<HeatPoint[]>([]);

  useEffect(() => {
    // Broadcast own location every 5 s
    const interval = setInterval(() => {
      if (!position) return;
      const rounded = {
        lat: roundCoord(position.lat),
        lng: roundCoord(position.lng),
      };
      supabase
        .channel("driver_heat")
        .send({ type: "broadcast", event: "ping", payload: rounded });
    }, 5000);

    // Listen for broadcasts from others
    const channel = supabase.channel("driver_heat");
    channel.on("broadcast", { event: "ping" }, (payload) => {
      setPoints((prev) => [...prev, payload.payload]);
    });
    channel.subscribe();

    // Cleanup
    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [position]);

  return { points };
}
