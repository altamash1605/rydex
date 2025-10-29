import { supabase } from '@/lib/supabaseClient';
import type { RideLogData } from '@/types/ride';

export async function logRide(data: RideLogData) {
  try {
    const { error } = await supabase.from('ride_logs').insert([data]);

    if (error) {
      console.error('❌ Error logging ride:', error.message);
    } else {
      console.log('✅ Ride logged successfully:', data);
    }
  } catch (err) {
    console.error('⚠️ Unexpected error logging ride:', err);
  }
}
