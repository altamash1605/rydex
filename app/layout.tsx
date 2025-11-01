import './globals.css';
import type { Metadata } from 'next';
import GeoPermissionWrapper from '@/components/GeoPermissionWrapper';

export const metadata: Metadata = {
  title: 'Rydex',
  description: 'Ride tracker app with real-time map and controls',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* ✅ PWA Manifest Link */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="m-0 p-0 overflow-hidden bg-gray-100">
        {/* ✅ Wrap everything in the permission checker */}
        <GeoPermissionWrapper>{children}</GeoPermissionWrapper>
      </body>
    </html>
  );
}
