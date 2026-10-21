import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { getPhotoStore, type PhotoStore } from '@/lib/drive/store';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import {
  embedJournalPhoto,
  JOURNAL_EMBEDDING_MODEL,
  journalVectorLiteral,
  MemoryEmbeddingError,
} from '@/lib/journal/memory-embeddings';
import { getPhotoMemoryConfig } from '@/lib/journal/photo-memory-config';
import {
  downloadAndNormalizePhoto,
  journalPhotoSourceHash,
  getPhotoMemoryPreprocessingVersion,
  PhotoMemoryError,
  type PhotoMemorySource,
} from '@/lib/journal/photo-memory-images';

export function isCurrentPhotoMemory(
  memory: {
    status: string;
    sourceHash: string;
    embeddingModel: string;
    preprocessingVersion: string;
  },
  photo: PhotoMemorySource,
): boolean {
  return (
    memory.status === 'INDEXED' &&
    memory.sourceHash === journalPhotoSourceHash(photo) &&
    memory.embeddingModel === JOURNAL_EMBEDDING_MODEL &&
    memory.preprocessingVersion === getPhotoMemoryPreprocessingVersion()
  );
}

export async function isPhotoIndexingPaused(database: PrismaClient): Promise<boolean> {
  return (await database.journalPhotoMemory.count({ where: { status: 'PAUSED' } })) > 0;
}

export async function resumePhotoIndexing(database: PrismaClient): Promise<void> {
  await database.journalPhotoMemory.updateMany({
    where: { status: 'PAUSED' },
    data: { status: 'FAILED' },
  });
}

export async function processJournalPhotoMemory(
  database: PrismaClient,
  photoId: string,
  userId: string,
  dependencies: { store?: PhotoStore; embed?: typeof embedJournalPhoto } = {},
): Promise<
  'disabled' | 'missing' | 'demo' | 'current' | 'stale' | 'indexed' | 'failed' | 'paused'
> {
  if (!getPhotoMemoryConfig().indexingEnabled) return 'disabled';

  const photo = await database.photo.findFirst({
    where: { id: photoId, entry: { userId } },
    include: { entry: { select: { userId: true, user: { select: { email: true } } } } },
  });
  if (!photo) return 'missing';
  if (photo.entry.user.email.toLowerCase() === getDemoCredentials()?.email) return 'demo';

  const sourceHash = journalPhotoSourceHash(photo);
  const existing = await database.journalPhotoMemory.findUnique({ where: { photoId } });
  if (existing && isCurrentPhotoMemory(existing, photo)) return 'current';

  let contentHash: string | null = null;
  let vector: number[] | null = null;
  let status = 'INDEXED';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    const normalized = await downloadAndNormalizePhoto(
      dependencies.store ?? getPhotoStore(),
      photo,
    );
    contentHash = normalized.contentHash;
    vector = await (dependencies.embed ?? embedJournalPhoto)(normalized);
    journalVectorLiteral(vector);
  } catch (error) {
    const inferenceFailure = error instanceof MemoryEmbeddingError;
    status = inferenceFailure
      ? 'PAUSED'
      : error instanceof PhotoMemoryError && !error.retryable
        ? 'SKIPPED'
        : 'FAILED';
    errorCode = inferenceFailure
      ? `EMBEDDING_${error.code}`
      : error instanceof PhotoMemoryError
        ? error.code
        : 'PHOTO_PROCESSING';
    errorMessage =
      error instanceof PhotoMemoryError || inferenceFailure
        ? error.message
        : 'Photo processing failed; check worker configuration and retry explicitly.';
  }

  return database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<PhotoMemorySource[]>(Prisma.sql`
      SELECT p.* FROM "Photo" p JOIN "Entry" e ON e."id" = p."entryId"
      WHERE p."id" = ${photoId} AND e."userId" = ${userId} FOR UPDATE OF p
    `);
    const current = rows[0];
    if (!current) return 'missing';
    if (journalPhotoSourceHash(current) !== sourceHash) return 'stale';

    await transaction.journalPhotoMemory.upsert({
      where: { photoId },
      create: {
        photoId,
        entryId: photo.entryId,
        userId,
        sourceHash,
        sourceUpdatedAt: photo.updatedAt,
        sourceVersion: photo.sourceVersion,
        contentHash,
        embeddingModel: JOURNAL_EMBEDDING_MODEL,
        preprocessingVersion: getPhotoMemoryPreprocessingVersion(),
        status,
        errorCode,
        errorMessage,
      },
      update: {
        entryId: photo.entryId,
        userId,
        sourceHash,
        sourceUpdatedAt: photo.updatedAt,
        sourceVersion: photo.sourceVersion,
        contentHash,
        embeddingModel: JOURNAL_EMBEDDING_MODEL,
        preprocessingVersion: getPhotoMemoryPreprocessingVersion(),
        status,
        errorCode,
        errorMessage,
      },
    });
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "JournalPhotoMemory" SET "embedding" = ${vector ? journalVectorLiteral(vector) : null}::vector WHERE "photoId" = ${photoId}
    `);

    return status === 'INDEXED' ? 'indexed' : status === 'PAUSED' ? 'paused' : 'failed';
  });
}
