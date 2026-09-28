import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import {
  embedJournalDocuments,
  JOURNAL_EMBEDDING_GENERATION,
  journalEmbeddingSourceHash,
  journalVectorLiteral,
} from '@/lib/journal/memory-embeddings';
import { enqueueJournalMemoryJob } from '@/lib/journal/memory-queue';
import { splitJournalNote } from '@/lib/journal/memory-passages';

type MemoryEntrySnapshot = {
  id: string
  userId: string
  note: string
  email: string
};

export type JournalMemoryIndexResult = 'missing' | 'demo' | 'current' | 'stale' | 'indexed';

type EmbedDocuments = typeof embedJournalDocuments

function isConfiguredDemoEmail(email: string): boolean {
  return email.toLowerCase() === getDemoCredentials()?.email;
}

function isCurrentGeneration(generation: {
  sourceHash: string
  embeddingModel: string
  passageVersion: string
}, sourceHash: string): boolean {
  return generation.sourceHash === sourceHash
    && generation.embeddingModel === JOURNAL_EMBEDDING_GENERATION.model
    && generation.passageVersion === JOURNAL_EMBEDDING_GENERATION.passageVersion;
}

export async function invalidateAndScheduleJournalMemory(
  database: PrismaClient,
  transaction: Prisma.TransactionClient,
  entryId: string,
  userId: string,
): Promise<void> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  await transaction.journalMemoryGeneration.deleteMany({ where: { entryId } });
  if (!user || isConfiguredDemoEmail(user.email)) return;
  await enqueueJournalMemoryJob(database, entryId, userId, transaction);
}

export async function processJournalMemoryEntry(
  database: PrismaClient,
  entryId: string,
  userId: string,
  embedDocuments: EmbedDocuments = embedJournalDocuments,
): Promise<JournalMemoryIndexResult> {
  const entry = await database.entry.findFirst({
    where: { id: entryId, userId },
    select: {
      id: true,
      userId: true,
      note: true,
      user: { select: { email: true } },
    },
  });
  if (!entry) return 'missing';
  if (isConfiguredDemoEmail(entry.user.email)) return 'demo';

  const sourceHash = journalEmbeddingSourceHash(entry.note);
  const existing = await database.journalMemoryGeneration.findUnique({
    where: { entryId },
    select: { sourceHash: true, embeddingModel: true, passageVersion: true },
  });
  if (existing && isCurrentGeneration(existing, sourceHash)) return 'current';

  const passages = splitJournalNote(entry.note);
  const embeddings = await embedDocuments(passages);
  if (embeddings.length !== passages.length) {
    throw new Error('The local Ollama embedding service returned an incomplete passage batch.');
  }

  return database.$transaction(async (transaction) => {
    const currentRows = await transaction.$queryRaw<MemoryEntrySnapshot[]>(Prisma.sql`
      SELECT e."id", e."userId", e."note", u."email"
      FROM "Entry" e
      JOIN "User" u ON u."id" = e."userId"
      WHERE e."id" = ${entryId} AND e."userId" = ${userId}
      FOR UPDATE OF e
    `);
    const current = currentRows[0];
    if (!current) return 'missing';
    if (isConfiguredDemoEmail(current.email)) return 'demo';
    if (journalEmbeddingSourceHash(current.note) !== sourceHash) return 'stale';

    const currentGeneration = await transaction.journalMemoryGeneration.findUnique({
      where: { entryId },
      select: { sourceHash: true, embeddingModel: true, passageVersion: true },
    });
    if (currentGeneration && isCurrentGeneration(currentGeneration, sourceHash)) return 'current';

    await transaction.journalMemoryGeneration.deleteMany({ where: { entryId } });
    await transaction.journalMemoryGeneration.create({
      data: {
        entryId,
        userId,
        sourceHash,
        embeddingModel: JOURNAL_EMBEDDING_GENERATION.model,
        passageVersion: JOURNAL_EMBEDDING_GENERATION.passageVersion,
      },
    });

    for (let passageIndex = 0; passageIndex < passages.length; passageIndex += 1) {
      const content = passages[passageIndex];
      const embedding = embeddings[passageIndex];
      if (!embedding) throw new Error('The local Ollama embedding service returned a missing vector.');
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "JournalMemoryPassage"
          ("generationId", "userId", "passageIndex", "content", "embedding")
        VALUES
          (${entryId}, ${userId}, ${passageIndex}, ${content}, ${journalVectorLiteral(embedding)}::vector)
      `);
    }
    return 'indexed';
  });
}
