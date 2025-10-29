// types/ride.ts

export type AppName = "Rapido" | "UberMoto";

/**
 * Logged Ride Summary (aggregated data per completed trip)
 */
export interface Ride {
  id: string;
  app: AppName;
  startLat: number;
  startLng: number;
  endLat?: number;
  endLng?: number;
  startTime: string;
  endTime?: string;
  distanceKm?: number;
  durationMin?: number;
  avgSpeedKmh?: number;
  fareGross?: number;
  commissionPct?: number;
  fareNet?: number;
  paymentMode?: "Cash" | "Online";
  notes?: string;
}

/**
 * Realtime ride state for tracking & Supabase logging
 */
export type RidePhase = "idle" | "toPickup" | "riding";

export interface RideLogData {
  user_id?: string | null;
  phase: RidePhase;
  lat: number;
  lng: number;
  speed: number;
  distance?: number | null;
  duration?: number | null;
  idle_time?: number | null;
  pickup_time?: number | null;
  ride_time?: number | null;
  created_at?: string;
}
