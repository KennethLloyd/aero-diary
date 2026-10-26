import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { JournalMemoryResult } from '@/lib/journal/memory-selection';
import { DriveConfigurationError } from '@/lib/drive/store';
import type { PhotoStore } from '@/lib/drive/store';
import { PhotoMemoryError } from '@/lib/journal/photo-memory-images';
import type * as PhotoMemoryImages from '@/lib/journal/photo-memory-images';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), normalize: vi.fn(), store: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { photo: { findFirst: mocks.findFirst } } }));
vi.mock('@/lib/drive/server-store', () => ({ getPhotoStore: mocks.store }));
vi.mock('@/lib/journal/photo-memory-images', async (original) => ({
  ...(await original<typeof import('@/lib/journal/photo-memory-images')>()),
  downloadAndNormalizePhoto: mocks.normalize,
}));

import { visualEvidenceMessage } from './visual-evidence';

const evidence: JournalMemoryResult[] = [
  {
    entryId: 'entry-1',
    journalDate: '2026-10-01',
    mood: 'GOOD',
    content: 'A nice day.',
    score: 0.9,
    sources: Array.from({ length: 5 }, (_, index) => ({
      sourceType: 'photo' as const,
      photoId: `photo-${index}`,
      similarity: 0.9,
    })),
  },
];
const photo = {
  id: 'photo-0',
  entryId: 'entry-1',
  drivePath: 'photos/legacy.jpg',
  driveFileId: 'file',
  mimeType: 'image/jpeg',
  sizeBytes: null,
  updatedAt: new Date(),
  sourceVersion: 1,
  entry: { journalDate: '2026-10-01', user: { email: 'synthetic@example.test' } },
};

describe('private visual evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.store.mockReset().mockReturnValue({});
    vi.stubEnv('PHOTO_MEMORY_ENABLED', 'true');
    vi.stubEnv('PHOTO_VISION_ENABLED', 'true');
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '3');
    mocks.findFirst.mockResolvedValue(photo);
    mocks.normalize.mockResolvedValue({ bytes: Buffer.from('normalized-jpeg') });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('bounds image forwarding and rechecks ownership and source after each private download', async () => {
    const result = await visualEvidenceMessage('owner-1', evidence);

    expect(mocks.normalize).toHaveBeenCalledTimes(3);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'photo-0',
          entryId: 'entry-1',
          entry: { userId: 'owner-1' },
        }),
      }),
    );
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ updatedAt: photo.updatedAt, sourceVersion: 1 }),
      }),
    );
    expect(result).toMatchObject({
      role: 'user',
      content: expect.arrayContaining([
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${Buffer.from('normalized-jpeg').toString('base64')}`,
          },
        },
      ]),
    });
    expect(JSON.stringify(result)).not.toContain('drive.google');
  });

  it('forwards a legacy WebP through the shared normalizer as a JPEG', async () => {
    const actualImages = await vi.importActual<typeof PhotoMemoryImages>(
      '@/lib/journal/photo-memory-images',
    );
    const source = await sharp({
      create: { width: 100, height: 50, channels: 3, background: 'teal' },
    })
      .webp()
      .toBuffer();
    const store = {
      download: vi.fn(
        async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(source);
              controller.close();
            },
          }),
      ),
    } as unknown as PhotoStore;
    mocks.store.mockReturnValue(store);
    mocks.normalize.mockImplementation(actualImages.downloadAndNormalizePhoto);

    const result = await visualEvidenceMessage('owner-1', evidence);

    if (!result || result.role !== 'user' || typeof result.content === 'string') {
      throw new Error('Vision message did not include image content.');
    }

    const imagePart = result.content.find((part) => part.type === 'image_url');
    expect(imagePart?.type).toBe('image_url');
    if (imagePart?.type !== 'image_url') return;

    const encodedImage = imagePart.image_url.url.split(',')[1];
    const metadata = await sharp(Buffer.from(encodedImage, 'base64')).metadata();
    expect(metadata.format).toBe('jpeg');
    expect([metadata.width, metadata.height]).toEqual([100, 50]);
  });

  it('skips an ambiguous progressive JPEG while forwarding another usable photo', async () => {
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '2');
    const actualImages = await vi.importActual<typeof PhotoMemoryImages>(
      '@/lib/journal/photo-memory-images',
    );
    const input = sharp({
      create: { width: 100, height: 50, channels: 3, background: 'teal' },
    });
    const progressive = await input.clone().jpeg({ progressive: true }).toBuffer();
    const valid = await input.jpeg().toBuffer();
    let downloadCount = 0;
    const store = {
      download: vi.fn(async () => {
        const source = downloadCount++ === 0 ? progressive.subarray(0, -2) : valid;

        return new ReadableStream({
          start(controller) {
            controller.enqueue(source);
            controller.close();
          },
        });
      }),
    } as unknown as PhotoStore;
    mocks.store.mockReturnValue(store);
    mocks.normalize.mockImplementation(actualImages.downloadAndNormalizePhoto);

    const result = await visualEvidenceMessage('owner-1', evidence);

    if (!result || result.role !== 'user' || typeof result.content === 'string') {
      throw new Error('The usable photo should still reach vision.');
    }

    const images = result.content.filter((part) => part.type === 'image_url');
    expect(images).toHaveLength(1);
    const expected = await actualImages.normalizeMemoryPhoto(valid, 'image/jpeg');
    expect(images[0].image_url.url).toBe(
      `data:image/jpeg;base64,${expected.bytes.toString('base64')}`,
    );
  });

  it('does not download unauthorized, deleted, or mismatched entry references', async () => {
    mocks.findFirst.mockResolvedValue(null);

    expect(await visualEvidenceMessage('other-owner', evidence)).toBeNull();
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('does not forward a photo deleted while private I/O was in progress', async () => {
    mocks.findFirst.mockResolvedValueOnce(photo).mockResolvedValue(null);

    expect(await visualEvidenceMessage('owner-1', evidence)).toBeNull();
    expect(mocks.normalize).toHaveBeenCalledTimes(1);
  });

  it.each(['PHOTO_MEMORY_ENABLED', 'PHOTO_VISION_ENABLED'])(
    'fetches no images when %s is disabled',
    async (flag) => {
      vi.stubEnv(flag, 'false');

      expect(await visualEvidenceMessage('owner-1', evidence)).toBeNull();
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.normalize).not.toHaveBeenCalled();
    },
  );

  it('logs the underlying Drive failure while preserving text fallback and private data', async () => {
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '1');
    const cause = Object.assign(
      new Error('Request to https://drive.example/private failed: SECRET'),
      {
        name: 'GaxiosError',
        code: 403,
        status: 403,
        config: { headers: { authorization: 'Bearer SECRET' } },
        response: { data: 'PRIVATE_IMAGE' },
      },
    );
    mocks.normalize.mockRejectedValue(
      new PhotoMemoryError('DRIVE_DOWNLOAD', 'Private photo download failed or timed out.', true, {
        cause,
      }),
    );

    const result = await visualEvidenceMessage('owner-1', evidence);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(
      'Photo forwarding failed; continuing with text evidence.',
      {
        code: 'PHOTO_FORWARDING_FAILED',
        photoId: 'photo-0',
        entryId: 'entry-1',
        stage: 'download_or_normalization',
        error: {
          name: 'PhotoMemoryError',
          code: 'DRIVE_DOWNLOAD',
          message: 'Private photo download failed or timed out.',
          cause: { name: 'GaxiosError', code: 403, status: 403 },
        },
      },
    );
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('PRIVATE_IMAGE');
    expect(logged).not.toContain('https://drive.example');
  });

  it('identifies missing Drive configuration without blocking text replies', async () => {
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '1');
    mocks.store.mockImplementation(() => {
      throw new DriveConfigurationError();
    });

    const result = await visualEvidenceMessage('owner-1', evidence);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        stage: 'drive_configuration',
        error: {
          name: 'DriveConfigurationError',
          message: 'Google Drive photo storage is not configured.',
        },
      }),
    );
  });

  it('identifies a failed source recheck without exposing database query contents', async () => {
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '1');
    const error = Object.assign(new Error('Query contained PRIVATE_NOTE'), { code: 'P1001' });
    mocks.findFirst.mockResolvedValueOnce(photo).mockRejectedValueOnce(error);

    const result = await visualEvidenceMessage('owner-1', evidence);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        stage: 'source_recheck',
        error: { name: 'Error', code: 'P1001' },
      }),
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('PRIVATE_NOTE');
  });

  it('propagates request cancellation without reporting a photo failure', async () => {
    const controller = new AbortController();
    const error = new Error('Request cancelled');
    mocks.normalize.mockImplementationOnce(async () => {
      controller.abort();
      throw error;
    });

    await expect(visualEvidenceMessage('owner-1', evidence, controller.signal)).rejects.toBe(error);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('deduplicates repeated evidence and re-fetches the photo on a subsequent turn', async () => {
    const onePhoto = [
      {
        ...evidence[0],
        sources: [{ sourceType: 'photo' as const, photoId: 'photo-0', similarity: 0.9 }],
      },
    ] as JournalMemoryResult[];

    await visualEvidenceMessage('owner-1', [...onePhoto, ...onePhoto]);
    await visualEvidenceMessage('owner-1', onePhoto);

    expect(mocks.normalize).toHaveBeenCalledTimes(2);
  });
});
