import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalMemoryResult } from '@/lib/journal/memory-selection';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), normalize: vi.fn(), store: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { photo: { findFirst: mocks.findFirst } } }));
vi.mock('@/lib/drive/server-store', () => ({ getPhotoStore: mocks.store }));
vi.mock('@/lib/journal/photo-memory-images', () => ({
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
    vi.stubEnv('PHOTO_MEMORY_ENABLED', 'true');
    vi.stubEnv('PHOTO_VISION_ENABLED', 'true');
    vi.stubEnv('PHOTO_VISION_MAX_IMAGES', '3');
    mocks.findFirst.mockResolvedValue(photo);
    mocks.normalize.mockResolvedValue({ bytes: Buffer.from('normalized-jpeg') });
  });

  afterEach(() => vi.unstubAllEnvs());

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

  it('keeps text replies available when Drive or normalization fails', async () => {
    mocks.normalize.mockRejectedValue(new Error('Invalid private image'));

    expect(await visualEvidenceMessage('owner-1', evidence)).toBeNull();
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
