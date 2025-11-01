import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 👇 Add this line — it satisfies Next 16’s requirement
  turbopack: {},

  output: 'export',
  images: {
    unoptimized: true,
  },

  // 👇 Your Webpack alias still works when Turbopack is empty
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@capacitor/haptics': false,
    };
    return config;
  },
};

export default nextConfig;
