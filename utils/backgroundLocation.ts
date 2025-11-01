import BackgroundGeolocation from '@capacitor-community/background-geolocation';

// 👇 We alias it to "BG" to make TypeScript happy even when running on web.
const BG: any = BackgroundGeolocation;

/**
 * Start background location tracking.
 * Requests permission if needed, then begins continuous tracking.
 */
export async function startBackgroundTracking() {
  try {
    // Request permissions only if available (prevents errors during web builds)
    if (BG?.requestPermissions) {
      await BG.requestPermissions();
    }

    // Add watcher for location updates
    await BG.addWatcher(
      {
        id: 'rydex-tracker', // Optional watcher ID for cleanup
        backgroundMessage: 'Rydex is tracking your ride…',
        backgroundTitle: 'Rydex Tracking',
        distanceFilter: 10, // meters between updates
      },
      async (location: any, error: any) => {
        if (error) {
          console.error('Background location error:', error);
          return;
        }

        // Called every time a location update occurs
        console.log('Background location:', location);

        // ✅ TODO: send to Supabase or your backend if desired
        // await logRide(location); // Example placeholder
      }
    );
  } catch (err) {
    console.error('Failed to start background tracking:', err);
  }
}

/**
 * Stop background location tracking.
 * Removes the active watcher if it exists.
 */
export async function stopBackgroundTracking() {
  try {
    if (BG?.removeWatcher) {
      await BG.removeWatcher({ id: 'rydex-tracker' });
      console.log('Stopped background tracking');
    }
  } catch (err) {
    console.error('Failed to stop background tracking:', err);
  }
}
