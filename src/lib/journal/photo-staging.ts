import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { MAX_PHOTO_COUNT, MAX_PHOTO_TOTAL_SIZE_BYTES } from '@/lib/journal/photos';
import type { PhotoStore, UploadedPhoto } from '@/lib/drive/store';

export const PHOTO_STAGE_CAPACITY_ERROR = 'You can attach up to 10 photos and 20 MB per entry.';

export const PHOTO_STAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type StagedPhotoView = {
  id: string
  clientKey: string
  drivePath: string
  driveFileId: string
  mimeType: string
  sizeBytes: number
}

type StagedPhotoDatabase = Pick<PrismaClient, '$transaction' | 'stagedPhoto' | 'stagedPhotoCancellation'>;

export type StagedPhotoTransaction = Pick<PrismaClient, 'stagedPhoto' | 'stagedPhotoCancellation'>;

export type StagedPhotoSelection = {
  readonly ids: readonly string[]
  readonly draftKey?: string
}

export type StagedPhotoRecord = Pick<
  StagedPhotoView,
  'id' | 'drivePath' | 'driveFileId' | 'mimeType' | 'sizeBytes'
>

export class StagedPhotoUnavailableError extends Error {
  constructor() {
    super('A staged photo is no longer available.');
    this.name = 'StagedPhotoUnavailableError';
  }
}

type StagePhotoInput = {
  userId: string
  draftKey: string
  clientKey: string
  file: File
}

export class PhotoStageCapacityError extends Error {
  constructor() {
    super(PHOTO_STAGE_CAPACITY_ERROR);
    this.name = 'PhotoStageCapacityError';
  }
}

export class PhotoStageCancelledError extends Error {
  constructor() {
    super('Photo upload was cancelled.');
    this.name = 'PhotoStageCancelledError';
  }
}

function stagedPhotoSelect() {
  return {
    id: true,
    clientKey: true,
    drivePath: true,
    driveFileId: true,
    mimeType: true,
    sizeBytes: true,
  } as const;
}

function toView(photo: StagedPhotoView): StagedPhotoView {
  return { ...photo };
}

async function stagedUsage(database: StagedPhotoDatabase, userId: string, draftKey: string) {
  const where = { userId, draftKey };
  const [count, aggregate] = await Promise.all([
    database.stagedPhoto.count({ where }),
    database.stagedPhoto.aggregate({
      where,
      _sum: { sizeBytes: true },
    }),
  ]);
  return { count, sizeBytes: aggregate._sum.sizeBytes ?? 0 };
}

async function cleanupUploadedPhoto(store: PhotoStore, photo: UploadedPhoto) {
  try {
    await store.deleteById(photo.fileId);
  } catch (error) {
    console.error('Unable to clean up a staged Drive photo after a database failure.', error);
  }
}

export async function cleanupExpiredStagedPhotos(
  database: StagedPhotoDatabase,
  store?: PhotoStore,
) {
  const cutoff = new Date(Date.now() - PHOTO_STAGE_MAX_AGE_MS);
  const cancellationCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    await database.stagedPhotoCancellation.deleteMany({
      where: { createdAt: { lt: cancellationCutoff } },
    });
  } catch (error) {
    console.error('Unable to remove expired photo cancellation records.', error);
  }
  let expired: {
    id: string
    userId: string
    draftKey: string
    clientKey: string
    drivePath: string
    driveFileId: string
  }[];
  try {
    expired = await database.stagedPhoto.findMany({
      where: { createdAt: { lt: cutoff } },
      select: {
        id: true,
        userId: true,
        draftKey: true,
        clientKey: true,
        drivePath: true,
        driveFileId: true,
      },
    });
  } catch (error) {
    console.error('Unable to find expired staged photos.', error);
    return;
  }

  const claimed: typeof expired = [];
  for (const photo of expired) {
    try {
      const deleted = await database.$transaction(async (transaction) => {
        const result = await transaction.stagedPhoto.deleteMany({ where: { id: photo.id } });
        if (result.count === 1) {
          await transaction.stagedPhotoCancellation.upsert({
            where: {
              userId_draftKey_clientKey: {
                userId: photo.userId,
                draftKey: photo.draftKey,
                clientKey: photo.clientKey,
              },
            },
            create: {
              userId: photo.userId,
              draftKey: photo.draftKey,
              clientKey: photo.clientKey,
              stagedPhotoId: photo.id,
              expired: true,
            },
            update: {
              createdAt: new Date(),
              stagedPhotoId: photo.id,
              expired: true,
            },
          });
        }
        return result.count;
      });
      if (deleted === 1) claimed.push(photo);
    } catch (error) {
      console.error('Unable to remove an expired staged photo row.', error);
    }
  }

  if (!store) {
    if (claimed.length > 0) {
      console.error('Expired staged photos were removed but Drive cleanup was unavailable.');
    }
    return;
  }
  const results = await Promise.allSettled(claimed.map((photo) => (
    store.delete(photo.drivePath, photo.driveFileId)
  )));
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Expired staged photo was removed but Drive cleanup failed.', result.reason);
    }
  });
}


export async function loadStagedPhotos(
  database: StagedPhotoDatabase,
  store: PhotoStore | undefined,
  userId: string,
  selection: StagedPhotoSelection,
): Promise<{ ids: string[]; data: StagedPhotoRecord[] }> {
  const ids = [...new Set(selection.ids)];
  if (ids.length === 0) return { ids, data: [] };
  if (!selection.draftKey) throw new StagedPhotoUnavailableError();

  await cleanupExpiredStagedPhotos(database, store);
  const [photos, cancellations] = await database.$transaction([
    database.stagedPhoto.findMany({
      where: { id: { in: ids }, userId, draftKey: selection.draftKey },
      select: stagedPhotoSelect(),
    }),
    database.stagedPhotoCancellation.findMany({
      where: {
        userId,
        draftKey: selection.draftKey,
        stagedPhotoId: { in: ids },
      },
      select: { stagedPhotoId: true, expired: true },
    }),
  ]);
  const expiredIds = cancellations.flatMap((cancellation) => (
    cancellation.expired && cancellation.stagedPhotoId ? [cancellation.stagedPhotoId] : []
  ));
  if (photos.length + expiredIds.length !== ids.length) {
    throw new StagedPhotoUnavailableError();
  }

  const data = photos.map(({ id, drivePath, driveFileId, mimeType, sizeBytes }) => ({
    id,
    drivePath,
    driveFileId,
    mimeType,
    sizeBytes,
  }));
  return { ids: data.map((photo) => photo.id), data };
}

export async function consumeStagedPhotos<T extends { id: string }>(
  transaction: StagedPhotoTransaction,
  userId: string,
  staged: { ids: readonly string[]; data: readonly T[] },
): Promise<T[]> {
  if (staged.ids.length === 0) return [...staged.data];
  const consumed = await transaction.stagedPhoto.deleteMany({
    where: { id: { in: [...staged.ids] }, userId },
  });
  if (consumed.count === staged.ids.length) return [...staged.data];

  const expiredCancellations = await transaction.stagedPhotoCancellation.findMany({
    where: {
      userId,
      stagedPhotoId: { in: [...staged.ids] },
      expired: true,
    },
    select: { stagedPhotoId: true },
  });
  const expiredIds = new Set(
    expiredCancellations.flatMap((cancellation) => (
      cancellation.stagedPhotoId ? [cancellation.stagedPhotoId] : []
    )),
  );
  if (expiredIds.size !== staged.ids.length - consumed.count) {
    throw new StagedPhotoUnavailableError();
  }
  return staged.data.filter((photo) => !expiredIds.has(photo.id));
}


export async function stagePhoto(
  database: StagedPhotoDatabase,
  store: PhotoStore,
  input: StagePhotoInput,
): Promise<StagedPhotoView> {
  await cleanupExpiredStagedPhotos(database, store);
  const existing = await database.stagedPhoto.findUnique({
    where: {
      userId_draftKey_clientKey: {
        userId: input.userId,
        draftKey: input.draftKey,
        clientKey: input.clientKey,
      },
    },
    select: stagedPhotoSelect(),
  });
  if (existing) return toView(existing);
  const cancellation = await database.stagedPhotoCancellation.findUnique({
    where: {
      userId_draftKey_clientKey: {
        userId: input.userId,
        draftKey: input.draftKey,
        clientKey: input.clientKey,
      },
    },
    select: { userId: true },
  });
  if (cancellation) throw new PhotoStageCancelledError();

  const usage = await stagedUsage(database, input.userId, input.draftKey);
  if (
    usage.count >= MAX_PHOTO_COUNT
    || usage.sizeBytes + input.file.size > MAX_PHOTO_TOTAL_SIZE_BYTES
  ) {
    throw new PhotoStageCapacityError();
  }

  const uploaded = await store.upload(input.file);
  let created: StagedPhotoView | undefined;
  try {
    created = await database.$transaction(async (transaction) => {
      const cancellation = await transaction.stagedPhotoCancellation.findUnique({
        where: {
          userId_draftKey_clientKey: {
            userId: input.userId,
            draftKey: input.draftKey,
            clientKey: input.clientKey,
          },
        },
        select: { userId: true },
      });
      if (cancellation) throw new PhotoStageCancelledError();
      return transaction.stagedPhoto.create({
        data: {
          userId: input.userId,
          draftKey: input.draftKey,
          clientKey: input.clientKey,
          drivePath: uploaded.drivePath,
          driveFileId: uploaded.fileId,
          mimeType: uploaded.mimeType,
          sizeBytes: input.file.size,
        },
        select: stagedPhotoSelect(),
      });
    });

    const finalUsage = await stagedUsage(database, input.userId, input.draftKey);
    if (
      finalUsage.count > MAX_PHOTO_COUNT
      || finalUsage.sizeBytes > MAX_PHOTO_TOTAL_SIZE_BYTES
    ) {
      await database.stagedPhoto.delete({ where: { id: created.id } });
      throw new PhotoStageCapacityError();
    }

    return toView(created);
  } catch (error) {
    if (created) {
      await database.stagedPhoto.deleteMany({ where: { id: created.id } }).catch((cleanupError) => {
        console.error('Unable to remove an invalid staged photo row.', cleanupError);
      });
    } else {
      try {
        const winner = await database.stagedPhoto.findUnique({
          where: {
            userId_draftKey_clientKey: {
              userId: input.userId,
              draftKey: input.draftKey,
              clientKey: input.clientKey,
            },
          },
          select: stagedPhotoSelect(),
        });
        if (winner) {
          await cleanupUploadedPhoto(store, uploaded);
          return toView(winner);
        }
      } catch (lookupError) {
        console.error('Unable to check for a concurrent staged photo.', lookupError);
      }
    }

    await cleanupUploadedPhoto(store, uploaded);
    throw error;
  }
}

async function cleanupStagedPhoto(
  store: PhotoStore,
  staged: { id: string; drivePath: string; driveFileId: string },
) {
  try {
    await store.delete(staged.drivePath, staged.driveFileId);
  } catch (error) {
    console.error('Staged photo was removed from the database but Drive cleanup failed.', error);
  }
}

export async function deleteStagedPhoto(
  database: StagedPhotoDatabase,
  store: PhotoStore,
  userId: string,
  id: string,
): Promise<boolean> {
  const staged = await database.$transaction(async (transaction) => {
    const photo = await transaction.stagedPhoto.findFirst({
      where: { id, userId },
      select: { id: true, draftKey: true, clientKey: true, drivePath: true, driveFileId: true },
    });
    if (!photo) return null;
    await transaction.stagedPhoto.delete({ where: { id: photo.id } });
    await transaction.stagedPhotoCancellation.upsert({
      where: {
        userId_draftKey_clientKey: {
          userId,
          draftKey: photo.draftKey,
          clientKey: photo.clientKey,
        },
      },
      create: {
        userId,
        draftKey: photo.draftKey,
        clientKey: photo.clientKey,
        stagedPhotoId: photo.id,
      },
      update: { createdAt: new Date(), stagedPhotoId: photo.id, expired: false },
    });
    return photo;
  });
  if (!staged) return false;
  await cleanupStagedPhoto(store, staged);
  return true;
}

export async function deleteStagedPhotoByKey(
  database: StagedPhotoDatabase,
  store: PhotoStore,
  userId: string,
  draftKey: string,
  clientKey: string,
  waitForUploadMs = 0,
): Promise<boolean> {
  let remainingWaitMs = waitForUploadMs;
  while (true) {
    const staged = await database.$transaction(async (transaction) => {
      const photo = await transaction.stagedPhoto.findUnique({
        where: {
          userId_draftKey_clientKey: { userId, draftKey, clientKey },
        },
        select: { id: true, draftKey: true, clientKey: true, drivePath: true, driveFileId: true },
      });
      if (photo) {
        await transaction.stagedPhoto.delete({ where: { id: photo.id } });
        await transaction.stagedPhotoCancellation.upsert({
          where: {
            userId_draftKey_clientKey: {
              userId,
              draftKey: photo.draftKey,
              clientKey: photo.clientKey,
            },
          },
          create: {
            userId,
            draftKey: photo.draftKey,
            clientKey: photo.clientKey,
            stagedPhotoId: photo.id,
          },
          update: { createdAt: new Date(), stagedPhotoId: photo.id, expired: false },
        });
        return photo;
      }
      if (remainingWaitMs > 0) return undefined;
      await transaction.stagedPhotoCancellation.upsert({
        where: { userId_draftKey_clientKey: { userId, draftKey, clientKey } },
        create: { userId, draftKey, clientKey },
        update: { createdAt: new Date(), stagedPhotoId: null, expired: false },
      });
      return null;
    });
    if (staged === undefined) {
      const delayMs = Math.min(500, remainingWaitMs);
      remainingWaitMs -= delayMs;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delayMs);
      await promise;
      continue;
    }
    if (staged === null) return false;
    await cleanupStagedPhoto(store, staged);
    return true;
  }
}
