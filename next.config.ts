import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {},  // keep this so Turbopack doesn’t complain
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
