import { describe, expect, it, vi } from 'vitest';
import {
  createPhotoUploadQueue,
  PHOTO_UPLOAD_CONCURRENCY,
  removeStagedPhotoByKey,
  uploadStagedPhoto,
} from '@/lib/journal/photo-upload';

describe('photo upload queue', () => {
  it('keeps at most the configured number of transfers active', async () => {
    const queue = createPhotoUploadQueue(PHOTO_UPLOAD_CONCURRENCY);
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const jobs = Array.from({ length: PHOTO_UPLOAD_CONCURRENCY + 2 }, (_, index) => queue.enqueue(() => {
      const { promise, resolve } = Promise.withResolvers<number>();
      active += 1;
      peak = Math.max(peak, active);
      releases.push(() => {
        active -= 1;
        resolve(index);
      });
      return promise;
    }));

    let completed = 0;
    while (completed < jobs.length) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()?.();
      completed += 1;
    }
    expect(peak).toBe(PHOTO_UPLOAD_CONCURRENCY);
    while (releases.length > 0) releases.shift()?.();

    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(PHOTO_UPLOAD_CONCURRENCY);
    expect(active).toBe(0);
  });

  it('returns the server staging id and exposes server errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'staged-1', status: 'ready' }), { status: 200 }));
    await expect(uploadStagedPhoto(
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      'draft-1',
      'client-1',
    )).resolves.toEqual({ id: 'staged-1' });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Try again.' }), { status: 500 }));
    await expect(uploadStagedPhoto(
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      'draft-1',
      'client-2',
    )).rejects.toThrow('Try again.');
    fetchMock.mockRestore();
  });

  it('treats cleanup of a missing stage as idempotent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(removeStagedPhotoByKey('draft-1', 'client-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/photo-stages?draftKey=draft-1&clientKey=client-1',
      { method: 'DELETE', keepalive: false },
    );
    fetchMock.mockRestore();
  });
});
