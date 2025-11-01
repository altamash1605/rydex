import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {}, // keep this so Turbopack is happy
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
