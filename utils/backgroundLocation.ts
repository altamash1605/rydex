import BackgroundGeolocation from '@capacitor-community/background-geolocation';
import { recordLocation } from './locationStore';

// 👇 We alias it to "BG" to make TypeScript happy even when running on web.
const BG: any = BackgroundGeolocation;

let watcherId: string | null = null;

/**
 * Start background location tracking.
 * Requests permission if needed, then begins continuous tracking.
 */
export async function startBackgroundTracking() {
  if (!BG) {
    return;
  }
  if (watcherId) {
    return;
  }

  try {
    // Request permissions only if available (prevents errors during web builds)
    if (BG?.requestPermissions) {
      await BG.requestPermissions();
    }

    // Add watcher for location updates
    watcherId = await BG.addWatcher(
      {
        // Passing an ID is supported by the plugin even though the type definition omits it.
        id: 'rydex-tracker',
        backgroundMessage: 'Rydex is tracking your ride…',
        backgroundTitle: 'Rydex Tracking',
        distanceFilter: 10, // meters between updates
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
  if (!BG) {
    return;
  }

  try {
    if (watcherId && BG?.removeWatcher) {
      await BG.removeWatcher({ id: watcherId });
      watcherId = null;
      console.log('Stopped background tracking');
    }
  } catch (err) {
    console.error('Failed to stop background tracking:', err);
  }
}
