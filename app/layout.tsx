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
    <html lang="en" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="h-full w-full m-0 p-0 overflow-hidden bg-black">
        <GeoPermissionWrapper>
          <div className="h-screen w-screen relative">{children}</div>
        </GeoPermissionWrapper>
      </body>
    </html>
  );
}
