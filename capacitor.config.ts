import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rydex.app',
  appName: 'Rydex',
  webDir: 'out',  // ✅ important — not "www"
  server: {
    androidScheme: 'https',
  },
};

export default config;
