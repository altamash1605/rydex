import { BackgroundGeolocation } from '@capacitor-community/background-geolocation';

export async function startBackgroundTracking() {
  // Ask for permission if not already granted
  await BackgroundGeolocation.requestPermissions();

  await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Rydex is tracking your ride…',
      backgroundTitle: 'Rydex Tracking',
      distanceFilter: 10, // meters between updates
    },
    async (location, error) => {
      if (error) {
        console.error('Background location error:', error);
        return;
      }

      console.log('Background location:', location);
      // TODO: send to Supabase or API endpoint if needed
    }
  );
}
