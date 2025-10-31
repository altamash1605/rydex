/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // avoids image optimization errors in static builds
  },
};

module.exports = nextConfig;
