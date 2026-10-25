import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createPhotoStore, type DriveFilesApi } from '@/lib/drive/store';

const mocks = vi.hoisted(() => ({ convertHeic: vi.fn() }));

const JPEG_BYTES = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AT//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAYE/AT//2Q==',
    'base64',
  ),
);
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  ),
);
const WEBP_BYTES = Uint8Array.from(
  Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==', 'base64'),
);

function syntheticHeicBytes() {
  return Uint8Array.from([
    0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31,
  ]);
}

vi.mock('heic-convert', () => ({ default: mocks.convertHeic }));

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

    return {
      data: {
        files: [{ id: 'photo-file', name: 'photo.jpg', mimeType: 'image/jpeg', size: '1234' }],
      },
    } as never;
  });
}

describe('Google Drive photo store', () => {
  it('loads from a standalone tsx process without a Next server context', () => {
    const output = execFileSync(
      'pnpm',
      [
        'exec',
        'tsx',
        '-e',
        "import { createPhotoStore } from './src/lib/drive/store.ts'; console.log(typeof createPhotoStore)",
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(output.trim()).toBe('function');
  });

  it('stores JPEG bytes as a .jpg even when the original metadata says PNG', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.create).mockResolvedValue({ data: { id: 'uploaded-file' } } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const uploaded = await store.upload(
      new File([new Uint8Array(JPEG_BYTES)], 'original.png', { type: 'image/png' }),
    );

    const jpegHash = createHash('md5').update(JPEG_BYTES).digest('hex');
    expect(uploaded).toEqual({
      drivePath: `photos/${jpegHash}.jpg`,
      fileId: 'uploaded-file',
      mimeType: 'image/jpeg',
      sizeBytes: JPEG_BYTES.byteLength,
    });
    expect(drive.create).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadType: 'multipart',
        requestBody: {
          mimeType: 'image/jpeg',
          name: `${jpegHash}.jpg`,
          parents: ['photos-folder'],
        },
        media: { mimeType: 'image/jpeg', body: expect.any(Readable) },
      }),
    );
  });

  it('stores PNG bytes as a .png even when the original metadata says JPEG', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.create).mockResolvedValue({ data: { id: 'uploaded-png-file' } } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const uploaded = await store.upload(
      new File([new Uint8Array(PNG_BYTES)], 'original.jpg', { type: 'image/jpeg' }),
    );

    expect(uploaded.drivePath.endsWith('.png')).toBe(true);
    expect(uploaded.mimeType).toBe('image/png');
    expect(uploaded.sizeBytes).toBe(PNG_BYTES.byteLength);
    expect(drive.create).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({ mimeType: 'image/png' }),
        requestBody: expect.objectContaining({
          mimeType: 'image/png',
          name: expect.stringMatching(/\.png$/),
        }),
      }),
    );
  });

  it('converts iPhone HEIC photos to JPEG before uploading and reports converted bytes', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.create).mockResolvedValue({ data: { id: 'uploaded-heic-file' } } as never);
    mocks.convertHeic.mockResolvedValue(Buffer.from(JPEG_BYTES));
    const heicBytes = syntheticHeicBytes();

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const uploaded = await store.upload(
      new File([new Uint8Array(heicBytes)], 'original.HEIC', { type: 'image/heic' }),
    );

    expect(uploaded.mimeType).toBe('image/jpeg');
    expect(uploaded.drivePath.endsWith('.jpg')).toBe(true);
    expect(uploaded.sizeBytes).toBe(JPEG_BYTES.byteLength);
    expect(mocks.convertHeic).toHaveBeenCalledWith({
      buffer: Buffer.from(heicBytes),
      format: 'JPEG',
      quality: 0.9,
    });

    const request = vi.mocked(drive.create).mock.calls.at(-1)?.[0] as {
      media: { body: Readable };
      requestBody: { mimeType: string; name: string };
    };
    const chunks: Buffer[] = [];
    for await (const chunk of request.media.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(JPEG_BYTES));
    expect(request.requestBody.mimeType).toBe('image/jpeg');
    expect(request.requestBody.name.endsWith('.jpg')).toBe(true);
  });

  it('rejects a real WebP image disguised as JPEG before any Drive write', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');

    await expect(
      store.upload(new File([new Uint8Array(WEBP_BYTES)], 'disguised.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow(/WebP.*not supported/i);
    expect(drive.create).not.toHaveBeenCalled();
    expect(drive.list).not.toHaveBeenCalled();
  });

  it('streams a photo by resolving its Drive-relative path', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);
    vi.mocked(drive.get).mockResolvedValue({
      data: Readable.from([Buffer.from('photo bytes')]),
    } as never);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    const downloaded = await store.download('photos/photo.jpg');
    await expect(new Response(downloaded).text()).resolves.toBe('photo bytes');
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
    vi.mocked(drive.get).mockResolvedValue({
      data: Readable.from([Buffer.from('photo bytes')]),
    } as never);

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

  it('caches the photo folder lookup across resolutions', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');
    await store.resolve('photos/first.jpg');
    await store.resolve('photos/second.jpg');

    expect(drive.list).toHaveBeenCalledTimes(4);
  });

  it('returns Drive byte size when resolving a photo', async () => {
    const drive = fakeDrive();
    folderAndFileResponses(drive);

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');

    await expect(store.resolve('photos/photo.jpg')).resolves.toMatchObject({
      status: 'resolved',
      sizeBytes: 1234,
    });
  });

  it('reports duplicate filenames instead of choosing an arbitrary Drive file', async () => {
    const drive = fakeDrive();
    drive.list.mockImplementation(async ({ q }) => {
      if (q?.includes("name = 'AeroDiary'")) {
        return { data: { files: [{ id: 'aero-folder', name: 'AeroDiary' }] } } as never;
      }
      if (q?.includes("name = 'photos'")) {
        return { data: { files: [{ id: 'photos-folder', name: 'photos' }] } } as never;
      }

      return {
        data: {
          files: [
            { id: 'first-file', name: 'photo.jpg', mimeType: 'image/jpeg' },
            { id: 'second-file', name: 'photo.jpg', mimeType: 'image/jpeg' },
          ],
        },
      } as never;
    });

    const store = createPhotoStore(drive as unknown as DriveFilesApi, 'AeroDiary/photos');

    await expect(store.resolve('photos/photo.jpg')).resolves.toEqual({
      status: 'duplicate',
      drivePath: 'photos/photo.jpg',
      fileIds: ['first-file', 'second-file'],
    });
  });
});
