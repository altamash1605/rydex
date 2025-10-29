'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Home } from 'lucide-react';
import { RideCard } from '@/components/RideCard';
import { Button } from '@/components/ui/button';

type RideLog = {
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

export default function HistoryPage() {
  const [rides, setRides] = useState<RideLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Fetch rides
    const fetchRides = async () => {
      try {
        const { data, error } = await supabase
          .from('ride_logs')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRides(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRides();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('ride_logs_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_logs' },
        async () => {
          const { data } = await supabase
            .from('ride_logs')
            .select('*')
            .order('created_at', { ascending: false });
          setRides(data || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-muted-foreground">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading rides...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-4">
        Failed to load rides: {error}
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-muted-foreground space-y-4">
        <div>
          <p className="text-lg">No rides recorded yet.</p>
          <p className="text-sm">Start a ride to see it appear here!</p>
        </div>
        <Button onClick={() => router.push('/')} className="mt-4 flex items-center gap-2">
          <Home className="w-4 h-4" />
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold mb-4">Ride History</h1>

      {rides.map((ride) => (
        <RideCard key={ride.id} ride={ride} />
      ))}

      {/* Bottom Button */}
      <div className="flex justify-center pt-6">
        <Button onClick={() => router.push('/')} className="flex items-center gap-2">
          <Home className="w-4 h-4" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
