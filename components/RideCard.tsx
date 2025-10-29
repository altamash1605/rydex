'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type RideCardProps = {
  ride: {
    id: string;
    phase: string | null;
    lat: number | null;
    lng: number | null;
    speed: number | null;
    distance: number | null;
    duration: number | null;
    idle_time: number | null;
    created_at: string;
  };
};

export function RideCard({ ride }: RideCardProps) {
  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base flex justify-between">
          <span className="capitalize">{ride.phase ?? 'Unknown Phase'}</span>
          <span className="text-sm text-muted-foreground">
            {new Date(ride.created_at).toLocaleString()}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p><strong>Lat:</strong> {ride.lat?.toFixed(5) ?? '--'}</p>
          <p><strong>Lng:</strong> {ride.lng?.toFixed(5) ?? '--'}</p>
          <p><strong>Speed:</strong> {ride.speed?.toFixed(1) ?? '--'} m/s</p>
          <p><strong>Distance:</strong> {ride.distance ?? '--'} m</p>
          <p><strong>Duration:</strong> {ride.duration ?? '--'} s</p>
          <p><strong>Idle Time:</strong> {ride.idle_time ?? '--'} s</p>
        </div>
      </CardContent>
    </Card>
  );
}
