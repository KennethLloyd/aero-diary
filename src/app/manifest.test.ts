import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/layout';
import manifest from '@/app/manifest';

const publicDir = join(process.cwd(), 'public');
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

function pngDimensions(filename: string) {
  const bytes = readFileSync(join(publicDir, filename));
  expect(bytes.subarray(0, 8)).toEqual(pngSignature);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('Aero Diary web manifest', () => {
  it('describes a standalone installation with local icon assets', () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: 'Aero Diary',
      short_name: 'Aero Diary',
      start_url: '/timeline',
      scope: '/',
      display: 'standalone',
      theme_color: '#69a7e1',
      background_color: '#69a7e1',
    });
    expect(value.icons).toEqual([
      expect.objectContaining({ src: '/icon-192x192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icon-512x512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        purpose: 'maskable',
      }),
    ]);
  });
  it('publishes local favicon and Safari Home Screen metadata', () => {
    expect(metadata).toMatchObject({
      appleWebApp: {
        capable: true,
        title: 'Aero Diary',
        statusBarStyle: 'default',
      },
      icons: {
        icon: expect.arrayContaining([
          expect.objectContaining({ url: '/icon.svg', type: 'image/svg+xml' }),
          expect.objectContaining({ url: '/icon-192x192.png', sizes: '192x192' }),
        ]),
        apple: expect.objectContaining({
          url: '/icon-512x512.png',
          sizes: '512x512',
        }),
      },
    });
  });
  it('ships the source logo and legible derived icon sizes', () => {
    expect(pngDimensions('aero-diary-logo.png')).toEqual({ width: 1254, height: 1254 });
    expect(pngDimensions('icon-192x192.png')).toEqual({ width: 192, height: 192 });
    expect(pngDimensions('icon-512x512.png')).toEqual({ width: 512, height: 512 });
    expect(pngDimensions('icon-512-maskable.png')).toEqual({ width: 512, height: 512 });
  });
  it('ships every manifest icon asset', () => {
    for (const filename of ['icon-192x192.png', 'icon-512x512.png', 'icon-512-maskable.png']) {
      const path = join(publicDir, filename);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });
});
