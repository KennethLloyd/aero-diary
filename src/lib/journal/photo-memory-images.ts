import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { PhotoStore } from '@/lib/drive/store';
import { JOURNAL_EMBEDDING_MODEL } from '@/lib/journal/memory-embeddings';
import { getPhotoMemoryConfig } from '@/lib/journal/photo-memory-config';

const PHOTO_MEMORY_PREPROCESSING_VERSION = 'jpeg-exif-white-v1';

export function getPhotoMemoryPreprocessingVersion(): string {
  const config = getPhotoMemoryConfig();

  return `${PHOTO_MEMORY_PREPROCESSING_VERSION}-edge${config.longestEdge}-q${config.jpegQuality}`;
}

export type PhotoMemorySource = {
  id: string;
  entryId: string;
  drivePath: string;
  driveFileId: string | null;
  mimeType: string;
  sizeBytes: number | null;
  updatedAt: Date;
  sourceVersion: number;
};

export class PhotoMemoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoMemoryError';
  }
}

export type NormalizedMemoryPhoto = {
  bytes: Buffer;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  contentHash: string;
  preprocessingVersion: string;
};

export function journalPhotoSourceHash(photo: PhotoMemorySource): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        photo.id,
        photo.entryId,
        photo.drivePath,
        photo.driveFileId,
        photo.mimeType,
        photo.sizeBytes,
        photo.updatedAt.toISOString(),
        photo.sourceVersion,
        JOURNAL_EMBEDDING_MODEL,
        getPhotoMemoryPreprocessingVersion(),
      ]),
    )
    .digest('hex');
}

export async function normalizeMemoryPhoto(
  bytes: Buffer,
  mimeType: string,
): Promise<NormalizedMemoryPhoto> {
  const config = getPhotoMemoryConfig();

  if (bytes.length > config.maxInputBytes) {
    throw new PhotoMemoryError(
      'INPUT_TOO_LARGE',
      'Photo exceeds the configured download byte limit.',
    );
  }
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    throw new PhotoMemoryError(
      'UNSUPPORTED_FORMAT',
      'Photo must use its JPEG or PNG representation.',
    );
  }

  try {
    const image = sharp(bytes, {
      limitInputPixels: config.maxDecodedPixels,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await image.metadata();

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > config.maxDecodedPixels
    ) {
      throw new PhotoMemoryError(
        'PIXEL_LIMIT',
        'Photo exceeds the configured decoded-pixel safety ceiling.',
      );
    }

    const expectedFormat = mimeType === 'image/png' ? 'png' : 'jpeg';

    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) > 1) {
      throw new PhotoMemoryError(
        'MIME_MISMATCH',
        'Photo contents do not match its JPEG or PNG MIME type.',
      );
    }

    const normalized = await image
      .rotate()
      .resize({
        width: config.longestEdge,
        height: config.longestEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: config.jpegQuality })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
      mimeType: 'image/jpeg',
      contentHash: createHash('sha256').update(normalized.data).digest('hex'),
      preprocessingVersion: getPhotoMemoryPreprocessingVersion(),
    };
  } catch (error) {
    if (error instanceof PhotoMemoryError) throw error;
    if (error instanceof Error && error.message.includes('pixel limit')) {
      throw new PhotoMemoryError(
        'PIXEL_LIMIT',
        'Photo exceeds the configured decoded-pixel safety ceiling.',
        false,
        { cause: error },
      );
    }

    throw new PhotoMemoryError(
      'INVALID_IMAGE',
      'Photo could not be safely decoded as JPEG or PNG.',
      false,
      { cause: error },
    );
  }
}

export async function downloadAndNormalizePhoto(
  store: PhotoStore,
  photo: Pick<PhotoMemorySource, 'drivePath' | 'driveFileId' | 'mimeType' | 'sizeBytes'>,
  externalSignal?: AbortSignal,
): Promise<NormalizedMemoryPhoto> {
  const config = getPhotoMemoryConfig();

  if (photo.sizeBytes !== null && photo.sizeBytes > config.maxInputBytes) {
    throw new PhotoMemoryError(
      'INPUT_TOO_LARGE',
      'Photo exceeds the configured download byte limit.',
    );
  }

  const timeout = AbortSignal.timeout(config.downloadTimeoutMs);
  const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const abort = () => {
    void reader?.cancel().catch(() => {});
  };

  try {
    signal.throwIfAborted();
    const stream = await store.download(photo.drivePath, photo.driveFileId ?? undefined, signal);
    reader = stream.getReader();
    signal.addEventListener('abort', abort, { once: true });
    const chunks: Buffer[] = [];
    let length = 0;

    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;

      length += value.byteLength;

      if (length > config.maxInputBytes) {
        await reader.cancel();
        throw new PhotoMemoryError(
          'INPUT_TOO_LARGE',
          'Photo exceeds the configured download byte limit.',
        );
      }

      chunks.push(Buffer.from(value));
    }

    return await normalizeMemoryPhoto(Buffer.concat(chunks), photo.mimeType);
  } catch (error) {
    if (error instanceof PhotoMemoryError) throw error;

    throw new PhotoMemoryError(
      'DRIVE_DOWNLOAD',
      'Private photo download failed or timed out.',
      true,
      { cause: error },
    );
  } finally {
    signal.removeEventListener('abort', abort);
    reader?.releaseLock();
  }
}
