import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadAndNormalizePhoto,
  normalizeMemoryPhoto,
  journalPhotoSourceHash,
} from './photo-memory-images';
import type { PhotoStore } from '@/lib/drive/store';

async function image(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    [format]()
    .toBuffer();
}

async function detailedJpeg() {
  const width = 128;
  const height = 128;
  const pixels = Buffer.alloc(width * height * 3);
  let value = 0x12345678;

  for (let index = 0; index < pixels.length; index += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    pixels[index] = value >>> 24;
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

afterEach(() => vi.unstubAllEnvs());

describe('photo normalization', () => {
  it.each([
    [6000, 4000],
    [8064, 6048],
  ])('accepts normal smartphone size %sx%s and reduces to 512', async (width, height) => {
    const result = await normalizeMemoryPhoto(await image(width, height), 'image/jpeg');
    expect(result.width).toBe(512);
    expect(result.height).toBe(Math.round((height * 512) / width));
  });

  it('rejects images above the default 64 million pixel ceiling', async () => {
    await expect(normalizeMemoryPhoto(await image(8100, 8100), 'image/jpeg')).rejects.toMatchObject(
      { code: 'PIXEL_LIMIT' },
    );
  });

  it('flattens transparent PNG white, keeps aspect ratio and does not upscale', async () => {
    const result = await normalizeMemoryPhoto(await image(100, 50, 'png'), 'image/png');
    expect([result.width, result.height]).toEqual([100, 50]);
    const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
  });

  it('normalizes EXIF orientation and strips metadata', async () => {
    const source = await sharp(await image(100, 50))
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await normalizeMemoryPhoto(source, 'image/jpeg');
    expect([result.width, result.height]).toEqual([50, 100]);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });

  it.each(['image/jpeg', 'image/webp'])(
    'normalizes a single-frame WebP labeled %s and strips its orientation metadata',
    async (mimeType) => {
      const source = await sharp(await image(100, 50))
        .withMetadata({ orientation: 6 })
        .webp()
        .toBuffer();

      const result = await normalizeMemoryPhoto(source, mimeType);

      expect([result.width, result.height]).toEqual([50, 100]);
      expect(result.mimeType).toBe('image/jpeg');
      const metadata = await sharp(result.bytes).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
    },
  );

  it('rejects animated WebP and WebP labeled as PNG', async () => {
    const red = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'red' },
    })
      .webp()
      .toBuffer();
    const blue = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'blue' },
    })
      .webp()
      .toBuffer();
    const animated = await sharp([red, blue], { join: { animated: true } })
      .webp()
      .toBuffer();

    await expect(normalizeMemoryPhoto(animated, 'image/webp')).rejects.toMatchObject({
      code: 'MIME_MISMATCH',
    });
    await expect(normalizeMemoryPhoto(animated, 'image/jpeg')).rejects.toMatchObject({
      code: 'MIME_MISMATCH',
    });
    await expect(normalizeMemoryPhoto(red, 'image/png')).rejects.toMatchObject({
      code: 'MIME_MISMATCH',
    });
  });

  it('recovers only a missing final JPEG end marker with byte-identical normalized output', async () => {
    const source = await image(100, 50);
    expect(source.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    const withoutEndMarker = source.subarray(0, -2);

    const recovered = await normalizeMemoryPhoto(withoutEndMarker, 'image/jpeg');
    const original = await normalizeMemoryPhoto(source, 'image/jpeg');

    expect(recovered.bytes).toEqual(original.bytes);
    expect(recovered.contentHash).toBe(original.contentHash);
    expect(recovered.preprocessingVersion).toBe(original.preprocessingVersion);
  });

  it('rejects JPEG corruption and truncation before the final end marker', async () => {
    const source = await detailedJpeg();
    const corruptHeader = Buffer.from(source);
    corruptHeader[0] = 0;
    const bytesToRemove = [3, 4, 12, 100, Math.floor(source.length / 2)];

    await expect(normalizeMemoryPhoto(corruptHeader, 'image/jpeg')).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });

    for (const length of bytesToRemove) {
      await expect(
        normalizeMemoryPhoto(source.subarray(0, -length), 'image/jpeg'),
      ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    }
  });

  it('rejects unsupported, corrupt, mismatched, oversized and excessive-pixel inputs explicitly', async () => {
    await expect(normalizeMemoryPhoto(Buffer.from('bad'), 'image/jpeg')).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
    await expect(normalizeMemoryPhoto(await image(10, 10), 'image/gif')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
    await expect(normalizeMemoryPhoto(await image(10, 10), 'image/png')).rejects.toMatchObject({
      code: 'MIME_MISMATCH',
    });
    vi.stubEnv('PHOTO_MEMORY_MAX_INPUT_BYTES', '1');
    await expect(normalizeMemoryPhoto(await image(10, 10), 'image/jpeg')).rejects.toMatchObject({
      code: 'INPUT_TOO_LARGE',
    });
    vi.unstubAllEnvs();
    vi.stubEnv('PHOTO_MEMORY_MAX_DECODED_PIXELS', '99');
    await expect(normalizeMemoryPhoto(await image(10, 10), 'image/jpeg')).rejects.toMatchObject({
      code: 'PIXEL_LIMIT',
    });
  });

  it('bounds unknown-size downloads and forwards an abort signal', async () => {
    vi.stubEnv('PHOTO_MEMORY_MAX_INPUT_BYTES', '2');
    const store = {
      download: vi.fn(
        async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(3));
              controller.close();
            },
          }),
      ),
    } as unknown as PhotoStore;
    await expect(
      downloadAndNormalizePhoto(store, {
        drivePath: 'photos/a.jpg',
        driveFileId: 'file',
        mimeType: 'image/jpeg',
        sizeBytes: null,
      }),
    ).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    expect(store.download).toHaveBeenCalledWith('photos/a.jpg', 'file', expect.any(AbortSignal));
  });

  it('preserves the original download exception as the failure cause', async () => {
    const cause = Object.assign(new Error('Drive unavailable'), { code: 'ECONNRESET' });
    const store: PhotoStore = {
      upload: vi.fn(),
      resolve: vi.fn(),
      delete: vi.fn(),
      deleteById: vi.fn(),
      download: vi.fn().mockRejectedValue(cause),
    };

    const result = downloadAndNormalizePhoto(store, {
      drivePath: 'photos/a.jpg',
      driveFileId: 'file',
      mimeType: 'image/jpeg',
      sizeBytes: null,
    });

    await expect(result).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD', cause });
  });

  it('invalidates sources changed with the same identity', () => {
    const source = {
      id: 'p',
      entryId: 'e',
      drivePath: 'photos/hash.jpg',
      driveFileId: 'f',
      mimeType: 'image/jpeg',
      sizeBytes: 42,
      updatedAt: new Date(),
      sourceVersion: 1,
    };
    expect(journalPhotoSourceHash(source)).not.toBe(
      journalPhotoSourceHash({ ...source, sourceVersion: 2 }),
    );
    expect(journalPhotoSourceHash(source)).not.toBe(
      journalPhotoSourceHash({ ...source, updatedAt: new Date(0) }),
    );
  });
});
