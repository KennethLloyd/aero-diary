import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  getPhotoStore: vi.fn(),
  photoFindFirst: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/drive/store', () => ({
  DrivePhotoNotFoundError: class DrivePhotoNotFoundError extends Error {},
  getPhotoStore: mocks.getPhotoStore,
}));
vi.mock('@/lib/db', () => ({ db: { photo: { findFirst: mocks.photoFindFirst } } }));

import { GET } from '@/app/photos/[id]/route';

describe('photo route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-id' });
    mocks.getPhotoStore.mockReturnValue({ download: mocks.download });
  });

  it('streams an owned photo with private immutable caching', async () => {
    mocks.photoFindFirst.mockResolvedValue({ driveFileId: 'drive-file', drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' });
    mocks.download.mockResolvedValue(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('photo bytes'));
        controller.close();
      },
    }));

    const response = await GET(new Request('http://localhost/photos/photo-id'), {
      params: Promise.resolve({ id: 'photo-id' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    await expect(response.text()).resolves.toBe('photo bytes');
    expect(mocks.photoFindFirst).toHaveBeenCalledWith({
      where: { id: 'photo-id', entry: { userId: 'user-id' } },
      select: { driveFileId: true, drivePath: true, mimeType: true },
    });
  });

  it('does not expose a photo owned by another user', async () => {
    mocks.photoFindFirst.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/photos/photo-id'), {
      params: Promise.resolve({ id: 'photo-id' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
