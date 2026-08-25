import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/layout';
import manifest from '@/app/manifest';

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
      expect.objectContaining({ src: '/icon-192x192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icon-512x512.png', sizes: '512x512' }),
      expect.objectContaining({
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        purpose: 'maskable',
      }),
    ]);
  });
  it('publishes Safari Home Screen metadata', () => {
    expect(metadata).toMatchObject({
      appleWebApp: {
        capable: true,
        title: 'Aero Diary',
        statusBarStyle: 'default',
      },
      icons: {
        icon: '/icon.svg',
        apple: '/icon-512-maskable.png',
      },
    });
  });
  it('ships every manifest icon asset', () => {
    for (const filename of ['icon-192x192.png', 'icon-512x512.png', 'icon-512-maskable.png']) {
      const path = join(process.cwd(), 'public', filename);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });
});
