import { Capacitor, registerPlugin } from '@capacitor/core';
import { recordLocation } from './locationStore';

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

/**
 * Start background location tracking.
 * Requests permission if needed, then begins continuous tracking.
 */
export async function startBackgroundTracking() {
  if (watcherId) {
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (!Capacitor.isPluginAvailable('BackgroundGeolocation')) {
    return;
  }

  try {
    // Request permissions only if available (prevents errors during web builds)
    if (BackgroundGeolocation?.requestPermissions) {
      await BackgroundGeolocation.requestPermissions();
    }

    // Add watcher for location updates
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        // Passing an ID is supported by the plugin even though the type definition omits it.
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

        if (!location) {
          return;
        }

        const { latitude, longitude, accuracy } = location;
        if (
          typeof latitude !== 'number' ||
          typeof longitude !== 'number' ||
          Number.isNaN(latitude) ||
          Number.isNaN(longitude)
        ) {
          return;
        }

        await recordLocation([latitude, longitude], accuracy);

        // also broadcast to Supabase in background
        try {
          const rounded = {
            lat: Math.round(latitude * 100) / 100,
            lng: Math.round(longitude * 100) / 100,
          };
          const { supabase } = await import('@/lib/supabaseClient');
          await supabase
            .channel('driver_heat')
            .send({ type: 'broadcast', event: 'ping', payload: rounded });
          console.log('📤 [BG] sent heat ping:', rounded);
        } catch (err) {
          console.warn('Supabase BG send error:', err);
        }

        console.log('Background location:', location);

      }
    );
  } catch (err) {
    console.error('Failed to start background tracking:', err);
    watcherId = null;
  }
}

/**
 * Stop background location tracking.
 * Removes the active watcher if it exists.
 */
export async function stopBackgroundTracking() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (!Capacitor.isPluginAvailable('BackgroundGeolocation')) {
    return;
  }

  try {
    if (watcherId && BackgroundGeolocation?.removeWatcher) {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
      watcherId = null;
      console.log('Stopped background tracking');
    }
  } catch (err) {
    console.error('Failed to stop background tracking:', err);
  }
}
