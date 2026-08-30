import { existsSync, readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/layout';
import manifest from '@/app/manifest';

const publicDir = join(process.cwd(), 'public');
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

type PngMetadata = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaceMethod: number;
  imageData: Buffer[];
};

function readPngMetadata(filename: string): PngMetadata {
  const bytes = readFileSync(join(publicDir, filename));
  expect(bytes.subarray(0, 8)).toEqual(pngSignature);

  let offset = 8;
  let metadata: PngMetadata | undefined;

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      metadata = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlaceMethod: data[12],
        imageData: [],
      };
    } else if (type === 'IDAT') {
      metadata?.imageData.push(data);
    }

    offset += length + 12;
  }

  if (!metadata) {
    throw new Error(`Missing IHDR chunk in ${filename}`);
  }

  return metadata;
}

function alphaStats(filename: string) {
  const { width, height, bitDepth, colorType, interlaceMethod, imageData } = readPngMetadata(filename);

  if (bitDepth !== 8 || colorType !== 6 || interlaceMethod !== 0) {
    throw new Error(`Unsupported RGBA PNG format in ${filename}`);
  }

  const channels = 4;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(height * stride);
  let rawOffset = 0;
  let transparentPixels = 0;
  let partialAlphaPixels = 0;

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
      const alpha = row[x * channels + 3];
      if (alpha === 0) {
        transparentPixels += 1;
      } else if (alpha < 255) {
        partialAlphaPixels += 1;
      }
    }
  }

  return { transparentPixels, partialAlphaPixels };
}

function icoEntries(filename: string) {
  const bytes = readFileSync(join(publicDir, filename));
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);

  const count = bytes.readUInt16LE(4);
  return [...Array(count)].map((_, index) => {
    const offset = 6 + index * 16;
    const width = bytes[offset] || 256;
    const height = bytes[offset + 1] || 256;
    const bytesInResource = bytes.readUInt32LE(offset + 8);
    const imageOffset = bytes.readUInt32LE(offset + 12);

    expect(bytes.subarray(imageOffset, imageOffset + 8)).toEqual(pngSignature);
    expect(imageOffset + bytesInResource).toBeLessThanOrEqual(bytes.length);

    return { width, height };
  });
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
    const iconMetadata = JSON.stringify(metadata.icons);

    expect(metadata).toMatchObject({
      appleWebApp: {
        capable: true,
        title: 'Aero Diary',
        statusBarStyle: 'default',
      },
    });
    for (const asset of [
      '/favicon.ico',
      '/icon-16x16.png',
      '/icon-32x32.png',
      '/icon-192x192.png',
      '/icon-512x512.png',
      '/apple-touch-icon.png',
    ]) {
      expect(iconMetadata).toContain(asset);
    }
    expect(iconMetadata).not.toMatch(/\.svg/);
  });

  it('ships the approved full logo and complete source-derived icon sizes', () => {
    expect(readPngMetadata('aero-diary-logo.png')).toMatchObject({
      width: 1254,
      height: 1254,
    });

    const expectedSizes = {
      'aero-diary-icon.png': 1254,
      'icon-16x16.png': 16,
      'icon-32x32.png': 32,
      'apple-touch-icon.png': 180,
      'icon-192x192.png': 192,
      'icon-512x512.png': 512,
      'icon-512-maskable.png': 512,
    };

    for (const [filename, size] of Object.entries(expectedSizes)) {
      const path = join(publicDir, filename);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
      expect(readPngMetadata(filename)).toMatchObject({
        width: size,
        height: size,
        bitDepth: 8,
        colorType: 6,
        interlaceMethod: 0,
      });
    }
  });

  it('preserves transparency in the source and every PNG derivative', () => {
    const sourceAlpha = alphaStats('aero-diary-icon.png');
    expect(sourceAlpha.transparentPixels).toBeGreaterThan(0);
    expect(sourceAlpha.partialAlphaPixels).toBeGreaterThan(0);

    for (const filename of [
      'icon-16x16.png',
      'icon-32x32.png',
      'apple-touch-icon.png',
      'icon-192x192.png',
      'icon-512x512.png',
      'icon-512-maskable.png',
    ]) {
      const stats = alphaStats(filename);
      expect(stats.transparentPixels).toBeGreaterThan(0);
      expect(stats.partialAlphaPixels).toBeGreaterThan(0);
    }
  });

  it('ships a valid multi-size favicon from the supplied icon', () => {
    expect(icoEntries('favicon.ico')).toEqual([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
    ]);
  });

  it('ships every manifest icon asset', () => {
    for (const filename of ['icon-192x192.png', 'icon-512x512.png', 'icon-512-maskable.png']) {
      const path = join(publicDir, filename);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });
});
