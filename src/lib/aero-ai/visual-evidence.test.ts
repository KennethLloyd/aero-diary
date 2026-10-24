import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalMemoryResult } from '@/lib/journal/memory-selection';
import { DriveConfigurationError } from '@/lib/drive/store';
import { PhotoMemoryError } from '@/lib/journal/photo-memory-images';

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
