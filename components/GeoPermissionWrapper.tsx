'use client';

import { useEffect } from 'react';

export default function GeoPermissionWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function ensurePermission() {
      try {
        // ✅ Try requesting high-accuracy permission
        if ('permissions' in navigator) {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          console.log('🛰️ Geolocation permission:', status.state);

          if (status.state === 'denied') {
            alert('⚠️ Please enable precise GPS in your phone settings for better accuracy.');
          }
        }

        // ✅ Prompt browser to request precise location immediately
        navigator.geolocation.getCurrentPosition(
          (pos) => console.log('📍 Initial GPS fix', pos.coords.accuracy, 'm'),
          (err) => console.warn('Permission request error:', err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } catch (err) {
        console.warn('Permission setup failed:', err);
      }
    }
    ensurePermission();
  }, []);

  return <>{children}</>;
}
