import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadAndNormalizePhoto,
  normalizeMemoryPhoto,
  journalPhotoSourceHash,
} from './photo-memory-images';
import type { PhotoStore } from '@/lib/drive/store';

async function image(width: number, height: number, format: 'jpeg' | 'png' = 'jpeg') {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    [format]()
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
