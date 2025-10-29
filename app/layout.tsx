import './globals.css';
import type { Metadata } from 'next';

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
      <body className="m-0 p-0 overflow-hidden bg-gray-100">
        {children}
      </body>
    </html>
  );
}