import { existsSync, readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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

function brightPixelBounds(filename: string) {
  const bytes = readFileSync(join(publicDir, filename));
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const imageData: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    } else if (type === 'IDAT') {
      imageData.push(data);
    }

    offset += length + 12;
  }

  if (bitDepth !== 8 || colorType !== 2 || interlaceMethod !== 0) {
    throw new Error(`Unsupported PNG format in ${filename}`);
  }

  const channels = 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(height * stride);
  const bounds = { left: width, top: height, right: -1, bottom: -1 };
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    const previousRowOffset = (y - 1) * stride;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const above = y > 0 ? pixels[previousRowOffset + index] : 0;
      const aboveLeft = y > 0 && index >= channels
        ? pixels[previousRowOffset + index - channels]
        : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : (() => {
                  const estimate = left + above - aboveLeft;
                  const leftDistance = Math.abs(estimate - left);
                  const aboveDistance = Math.abs(estimate - above);
                  const aboveLeftDistance = Math.abs(estimate - aboveLeft);
                  return leftDistance <= aboveDistance && leftDistance <= aboveLeftDistance
                    ? left
                    : aboveDistance <= aboveLeftDistance
                      ? above
                      : aboveLeft;
                })();

      row[index] = (row[index] + predictor) & 0xff;
      pixels[y * stride + index] = row[index];
    }

    for (let x = 0; x < width; x += 1) {
      const pixelOffset = x * channels;
      if (row[pixelOffset] > 220 && row[pixelOffset + 1] > 220 && row[pixelOffset + 2] > 220) {
        bounds.left = Math.min(bounds.left, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.right = Math.max(bounds.right, x);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
  }

  return bounds;
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
          expect.objectContaining({ url: '/icon-192x192.png', type: 'image/png', sizes: '192x192' }),
          expect.objectContaining({ url: '/icon-512x512.png', type: 'image/png', sizes: '512x512' }),
        ]),
        apple: expect.objectContaining({
          url: '/icon-512x512.png',
          sizes: '512x512',
        }),
      },
    });
    expect(JSON.stringify(metadata.icons)).not.toContain('/icon.svg');
  });
  it('ships the source logo and legible derived icon sizes', () => {
    expect(pngDimensions('aero-diary-logo.png')).toEqual({ width: 1254, height: 1254 });
    expect(pngDimensions('icon-192x192.png')).toEqual({ width: 192, height: 192 });
    expect(pngDimensions('icon-512x512.png')).toEqual({ width: 512, height: 512 });
    expect(pngDimensions('icon-512-maskable.png')).toEqual({ width: 512, height: 512 });
  });
  it('keeps derived artwork inside the maskable safe zone', () => {
    const safeEdge = Math.ceil(512 * 0.1);

    for (const filename of ['icon-512x512.png', 'icon-512-maskable.png']) {
      const bounds = brightPixelBounds(filename);

      expect(bounds.left).toBeGreaterThanOrEqual(safeEdge);
      expect(bounds.top).toBeGreaterThanOrEqual(safeEdge);
      expect(bounds.right).toBeLessThan(512 - safeEdge);
      expect(bounds.bottom).toBeLessThan(512 - safeEdge);
    }
  });
  it('ships every manifest icon asset', () => {
    for (const filename of ['icon-192x192.png', 'icon-512x512.png', 'icon-512-maskable.png']) {
      const path = join(publicDir, filename);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });
});
