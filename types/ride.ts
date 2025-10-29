export type AppName = "Rapido" | "UberMoto";

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
