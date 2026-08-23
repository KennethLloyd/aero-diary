import type { PrismaClient } from '@/generated/prisma/client';
import type { DrivePhotoResolution } from '@/lib/drive/store';

export type JournalPhotoResolver = {
  resolve(drivePath: string): Promise<DrivePhotoResolution>
};

export type PhotoPreflightReport = {
  total: number
  resolved: number
  missing: string[]
  duplicates: string[]
  applied: number
};

export class PhotoPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoPreflightError';
  }
}

const RESOLUTION_CONCURRENCY = 8;

export async function preflightJournalPhotos(
  database: PrismaClient,
  userId: string,
  resolver: JournalPhotoResolver,
  apply = false,
): Promise<PhotoPreflightReport> {
  const photos = await database.photo.findMany({
    where: {
      entry: {
        userId,
        sourceId: { not: null },
      },
    },
    select: { id: true, drivePath: true },
    orderBy: { id: 'asc' },
  });

  const resolutions = new Map<string, DrivePhotoResolution>();
  const uniqueDrivePaths = [...new Set(photos.map((photo) => photo.drivePath))];
  for (let index = 0; index < uniqueDrivePaths.length; index += RESOLUTION_CONCURRENCY) {
    const batch = uniqueDrivePaths.slice(index, index + RESOLUTION_CONCURRENCY);
    const batchResolutions = await Promise.all(
      batch.map(async (drivePath) => [drivePath, await resolver.resolve(drivePath)] as const),
    );
    for (const [drivePath, resolution] of batchResolutions) {
      resolutions.set(drivePath, resolution);
    }
  }

  const missing = [...resolutions.values()]
    .filter((resolution) => resolution.status === 'missing')
    .map((resolution) => resolution.drivePath)
    .sort();
  const duplicates = [...resolutions.values()]
    .filter((resolution) => resolution.status === 'duplicate')
    .map((resolution) => resolution.drivePath)
    .sort();
  const resolved = photos.filter((photo) => resolutions.get(photo.drivePath)?.status === 'resolved').length;

  if (apply && (missing.length > 0 || duplicates.length > 0)) {
    throw new PhotoPreflightError(
      `Photo preflight cannot apply with ${missing.length} missing and ${duplicates.length} duplicate path(s).`,
    );
  }

  let applied = 0;
  if (apply) {
    await database.$transaction(async (transaction) => {
      for (const photo of photos) {
        const resolution = resolutions.get(photo.drivePath);
        if (!resolution || resolution.status !== 'resolved') continue;
        await transaction.photo.update({
          where: { id: photo.id },
          data: {
            driveFileId: resolution.fileId,
            mimeType: resolution.mimeType,
          },
        });
        applied += 1;
      }
    });
  }

  return {
    total: photos.length,
    resolved,
    missing,
    duplicates,
    applied,
  };
}
