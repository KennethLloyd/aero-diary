import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aero Diary',
  description: 'Your memories, vividly preserved.',
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