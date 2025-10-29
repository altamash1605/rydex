'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type RideLog = {
  id: string;
  timestamp: string;
  phase: string;
  lat: number;
  lng: number;
  distance: number | null;
  idle_time: number | null;
  duration: number | null;
  pickup_time?: number | null;
  ride_time?: number | null;
};

export default function HistoryPage() {
  const [logs, setLogs] = useState<RideLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      const { data, error } = await supabase
        .from('ride_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) console.error('Supabase fetch error:', error);
      else setLogs(data || []);
      setLoading(false);
    }

    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-semibold mb-4">Ride History</h1>

      {logs.length === 0 ? (
        <p className="text-gray-500">No rides logged yet.</p>
      ) : (
        logs.map((log) => (
          <Card key={log.id} className="rounded-2xl shadow-md border border-gray-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium capitalize">{log.phase}</span>
                <span className="text-sm text-gray-500">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-700">
                <div>
                  Distance:{' '}
                  <span className="font-semibold">{(log.distance ?? 0).toFixed(1)} m</span>
                </div>
                <div>
                  Idle Time: <span className="font-semibold">{log.idle_time ?? 0}s</span>
                </div>
                <div>
                  Duration: <span className="font-semibold">{log.duration ?? 0}s</span>
                </div>
                {log.pickup_time != null && (
                  <div>
                    Pickup Time: <span className="font-semibold">{log.pickup_time}s</span>
                  </div>
                )}
                {log.ride_time != null && (
                  <div>
                    Ride Time: <span className="font-semibold">{log.ride_time}s</span>
                  </div>
                )}
                <div>
                  Coords:{' '}
                  <span className="font-mono text-xs">
                    {log.lat?.toFixed(5)}, {log.lng?.toFixed(5)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
