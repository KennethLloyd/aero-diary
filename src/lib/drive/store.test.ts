import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createPhotoStore, type DriveFilesApi } from '@/lib/drive/store';

function fakeDrive() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };
}

function folderAndFileResponses(drive: ReturnType<typeof fakeDrive>) {
  const list = drive.list;
  list.mockImplementation(async ({ q }) => {
    if (q?.includes("name = 'AeroDiary'")) {
      return { data: { files: [{ id: 'aero-folder', name: 'AeroDiary' }] } } as never;
    }
    if (q?.includes("name = 'photos'")) {
      return { data: { files: [{ id: 'photos-folder', name: 'photos' }] } } as never;
    }
    return { data: { files: [{ id: 'photo-file', name: 'photo.jpg', mimeType: 'image/jpeg' }] } } as never;
  });
}

describe('Google Drive photo store', () => {
  it('uploads a photo as a hashed JPEG through multipart files.create', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.create).mockResolvedValue({ data: { id: 'uploaded-file' } } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const uploaded = await store.upload(new File(['hello'], 'original.jpg', { type: 'image/jpeg' }));

    expect(uploaded).toEqual({
      drivePath: 'photos/5d41402abc4b2a76b9719d911017c592.jpg',
      fileId: 'uploaded-file',
      mimeType: 'image/jpeg',
    });
    expect(drive.create).toHaveBeenCalledWith(expect.objectContaining({
      uploadType: 'multipart',
      requestBody: {
        mimeType: 'image/jpeg',
        name: '5d41402abc4b2a76b9719d911017c592.jpg',
        parents: ['photos-folder'],
      },
      media: { mimeType: 'application/octet-stream', body: expect.any(Readable) },
    }));
  });

  it('streams a photo by resolving its Drive-relative path', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.get).mockResolvedValue({ data: Readable.from([Buffer.from('photo bytes')]) } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const downloaded = await store.download('photos/photo.jpg');

    await expect(new Response(downloaded).text()).resolves.toBe('photo bytes');
    expect(drive.get).toHaveBeenCalledWith(
      { fileId: 'photo-file', alt: 'media' },
      { responseType: 'stream' },
    );
  });

  it('deletes the Drive file resolved from its relative path', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    await store.delete('photos/photo.jpg');

    expect(drive.delete).toHaveBeenCalledWith({ fileId: 'photo-file' });
  });

  it('uses a stored Drive file id without resolving a duplicate hash path', async () => {
    const drive = fakeDrive();
    vi.mocked(drive.get).mockResolvedValue({ data: Readable.from([Buffer.from('photo bytes')]) } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    await store.download('photos/photo.jpg', 'known-file');
    await store.delete('photos/photo.jpg', 'known-file');

    expect(drive.list).not.toHaveBeenCalled();
    expect(drive.get).toHaveBeenCalledWith(
      { fileId: 'known-file', alt: 'media' },
      { responseType: 'stream' },
    );
    expect(drive.delete).toHaveBeenCalledWith({ fileId: 'known-file' });
  });
});
