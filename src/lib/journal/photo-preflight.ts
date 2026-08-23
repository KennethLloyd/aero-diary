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
  for (const photo of photos) {
    if (!resolutions.has(photo.drivePath)) {
      resolutions.set(photo.drivePath, await resolver.resolve(photo.drivePath));
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
