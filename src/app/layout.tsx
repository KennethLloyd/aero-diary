import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aero Diary',
  applicationName: 'Aero Diary',
  description: 'Your memories, vividly preserved.',
  appleWebApp: {
    capable: true,
    title: 'Aero Diary',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        type: 'image/x-icon',
        sizes: 'any',
      },
      {
        url: '/icon-16x16.png',
        type: 'image/png',
        sizes: '16x16',
      },
      {
        url: '/icon-32x32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/icon-192x192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        url: '/icon-512x512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    apple: {
      url: '/apple-touch-icon.png',
      type: 'image/png',
      sizes: '180x180',
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#69a7e1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}