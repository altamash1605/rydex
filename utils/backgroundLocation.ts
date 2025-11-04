// utils/backgroundLocation.ts
import { Capacitor, registerPlugin } from '@capacitor/core';
import { recordLocation } from './locationStore';
import { sendDriverPing } from '@/utils/edge';

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

// ⏱️ Simple throttles
let lastSend = 0;
let lastLog = 0;

// 🔑 Stable per-install driver ID via localStorage (works in web & Capacitor WebView)
let _driverId: string | undefined;
async function getDriverId() {
  if (_driverId) return _driverId;
  const KEY = 'rydex_driver_id';
  try {
    const existing = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (existing) {
      _driverId = existing;
      return existing;
    }
    const id = crypto.randomUUID();
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, id);
    _driverId = id;
    return id;
  } catch {
    // Fallback if localStorage is unavailable
    const id = crypto.randomUUID();
    _driverId = id;
    return id;
  }
}

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

        // Update local store immediately
        await recordLocation([latitude, longitude], accuracy);

        // Debounce network send (5s cadence)
        const now = Date.now();
        if (now - lastSend >= 5000) {
          lastSend = now;
          try {
            const driver_id = await getDriverId();

            await sendDriverPing({
              driver_id,
              lat: latitude,
              lng: longitude,
              accuracy: typeof accuracy === 'number' ? accuracy : undefined,
            });

            // Occasional log to keep console tidy
            if (now - lastLog > 60000) {
              console.log('📤 [BG] edge ping sent:', {
                lat: Number(latitude.toFixed(5)),
                lng: Number(longitude.toFixed(5)),
                accuracy,
              });
              lastLog = now;
            }
          } catch (err) {
            console.warn('sendDriverPing error:', err);
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
  } catch (err) {
    console.error('Failed to stop background tracking:', err);
  }
}
