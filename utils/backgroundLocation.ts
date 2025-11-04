import { Capacitor, registerPlugin } from '@capacitor/core';
import { recordLocation } from './locationStore';
import { supabase } from '@/lib/supabaseClient';

type BackgroundPlugin = {
  requestPermissions?: () => Promise<void>;
  addWatcher: (
    options: Record<string, unknown>,
    callback: (location: any, error: any) => void,
  ) => Promise<string>;
  removeWatcher?: (options: { id: string }) => Promise<void>;
};

const BackgroundGeolocation = registerPlugin<BackgroundPlugin>('BackgroundGeolocation', {
  web: () => ({
    requestPermissions: async () => undefined,
    addWatcher: async () => {
      console.warn('Background geolocation is not available on the web.');
      return 'web-noop';
    },
    removeWatcher: async () => undefined,
  }),
});

let watcherId: string | null = null;

// 🧭 Reuse one Supabase channel globally
let channel: ReturnType<typeof supabase.channel> | null = null;
let lastSend = 0;
let lastLog = 0;

/**
 * Start background location tracking.
 * Requests permission if needed, then begins continuous tracking.
 */
export async function startBackgroundTracking() {
  if (watcherId) return;
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('BackgroundGeolocation')) return;

  try {
    // Request permissions only if available
    if (BackgroundGeolocation?.requestPermissions) {
      await BackgroundGeolocation.requestPermissions();
    }

    // Initialize Supabase channel once
    if (!channel) {
      channel = supabase.channel('driver_heat');
      channel.subscribe();
    }

    watcherId = await BackgroundGeolocation.addWatcher(
      {
        id: 'rydex-tracker',
        backgroundMessage: 'Rydex is tracking your ride…',
        backgroundTitle: 'Rydex Tracking',
        distanceFilter: 30, // meters between updates
        requestPermissions: true,
      } as any,
      async (location: any, error: any) => {
        if (error) {
          console.error('Background location error:', error);
          return;
        }
        if (!location) return;

        const { latitude, longitude, accuracy } = location;
        if (
          typeof latitude !== 'number' ||
          typeof longitude !== 'number' ||
          Number.isNaN(latitude) ||
          Number.isNaN(longitude)
        ) {
          return;
        }

        // Update local store
        await recordLocation([latitude, longitude], accuracy);

        // Debounce network broadcast
        const now = Date.now();
        if (now - lastSend >= 5000 && channel) {
          lastSend = now;

          try {
            const rounded = {
              lat: Math.round(latitude * 100) / 100,
              lng: Math.round(longitude * 100) / 100,
            };

            await channel.send({
              type: 'broadcast',
              event: 'ping',
              payload: rounded,
            });

            // Log only occasionally to avoid console spam
            if (now - lastLog > 60000) {
              console.log('📤 [BG] broadcast active (last ping):', rounded);
              lastLog = now;
            }
          } catch (err) {
            console.warn('Supabase BG send error:', err);
          }
        }
      }
    );
  } catch (err) {
    console.error('Failed to start background tracking:', err);
    watcherId = null;
  }
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundTracking() {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('BackgroundGeolocation')) return;

  try {
    if (watcherId && BackgroundGeolocation?.removeWatcher) {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
      watcherId = null;
      console.log('Stopped background tracking');
    }
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
  } catch (err) {
    console.error('Failed to stop background tracking:', err);
  }
}
