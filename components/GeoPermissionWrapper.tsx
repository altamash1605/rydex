'use client';

import { useEffect } from 'react';

export default function GeoPermissionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((res) => {
          if (res.state === 'denied') {
            alert('⚠️ Please enable precise GPS access in browser settings for better accuracy.');
          } else {
            console.log('🛰️ Geolocation permission:', res.state);
          }
        })
        .catch((err) => console.warn('Permission check failed:', err));
    }
  }, []);

  return <>{children}</>;
}
