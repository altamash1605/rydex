'use client';

import { useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function RideLogger() {
  // 🔹 Log stats every few seconds
  useEffect(() => {
    const handler = async (e: any) => {
      const stats = e.detail;
      if (!stats) return;

      const { phase, idle, idleSec, pickupSec, rideSec, distanceM, points } = stats;
      const last = points[points.length - 1];
      if (!last) return;

      const { error } = await supabase.from('ride_logs').insert([
        {
          phase,
          lat: last[0],
          lng: last[1],
          distance: distanceM,
          idle_time: idleSec,
          ride_time: rideSec,
          pickup_time: pickupSec,
        },
      ]);

      if (error) console.warn('🟥 Supabase log error:', error);
    };

    window.addEventListener('rydex-ride-stats', handler);
    return () => window.removeEventListener('rydex-ride-stats', handler);
  }, []);

  // 🔹 Final ride snapshot
  useEffect(() => {
    const finishedHandler = async (e: any) => {
      const { rideStartAt, rideEndAt, distanceM, points } = e.detail;
      const start = points[0];
      const end = points[points.length - 1];

      const { error } = await supabase.from('ride_summaries').insert([
        {
          ride_start_at: new Date(rideStartAt).toISOString(),
          ride_end_at: new Date(rideEndAt).toISOString(),
          distance: distanceM,
          start_lat: start?.[0],
          start_lng: start?.[1],
          end_lat: end?.[0],
          end_lng: end?.[1],
        },
      ]);

      if (error) console.warn('🟥 Supabase summary error:', error);
    };

    window.addEventListener('rydex-ride-finished', finishedHandler);
    return () => window.removeEventListener('rydex-ride-finished', finishedHandler);
  }, []);

  return null;
}
