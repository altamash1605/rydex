import type { TurbopackConfig } from 'next/dist/server/config-shared';

const config: TurbopackConfig = {
  resolveAlias: {
    // ✅ Tell Turbopack to ignore the native-only Capacitor module
    '@capacitor/haptics': false,
  },
};

export default config;

