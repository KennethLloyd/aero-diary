import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import { db } from '@/lib/db';
import {
  embedJournalQuery,
  JOURNAL_EMBEDDING_GENERATION,
  journalEmbeddingSourceHash,
  journalVectorLiteral,
} from '@/lib/journal/memory-embeddings';

const journalMemoryQuerySchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(20).default(8),
});

type JournalMemoryRow = {
  entryId: string
  journalDate: string
  mood: string
  content: string
  sourceNote: string
  sourceHash: string
  embeddingModel: string
  passageVersion: string
  distance: number
};

export type JournalMemoryResult = {
  entryId: string
  journalDate: string
  mood: string
  content: string
  score: number
};

export async function retrieveJournalMemoryForUser(
  userId: string,
  input: { query: string; limit?: number },
): Promise<JournalMemoryResult[]> {
  const { query, limit } = journalMemoryQuerySchema.parse(input);
  const demoEmail = getDemoCredentials()?.email;
  const embedding = await embedJournalQuery(query);
  const maxResults = Math.min(limit * 4, 80);
  const demoFilter = demoEmail
    ? Prisma.sql`AND lower(u."email") <> ${demoEmail}`
    : Prisma.empty;

  const rows = await db.$queryRaw<JournalMemoryRow[]>(Prisma.sql`
    SELECT
      e."id" AS "entryId",
      e."journalDate",
      e."mood",
      p."content",
      e."note" AS "sourceNote",
      g."sourceHash",
      g."embeddingModel",
      g."passageVersion",
      (p."embedding" <=> ${journalVectorLiteral(embedding)}::vector)::float AS "distance"
    FROM "JournalMemoryPassage" p
    JOIN "JournalMemoryGeneration" g
      ON g."entryId" = p."generationId" AND g."userId" = p."userId"
    JOIN "Entry" e
      ON e."id" = g."entryId" AND e."userId" = g."userId"
    JOIN "User" u ON u."id" = e."userId"
    WHERE p."userId" = ${userId}
      AND g."userId" = ${userId}
      AND e."userId" = ${userId}
      AND g."embeddingModel" = ${JOURNAL_EMBEDDING_GENERATION.model}
      AND g."passageVersion" = ${JOURNAL_EMBEDDING_GENERATION.passageVersion}
      ${demoFilter}
    ORDER BY p."embedding" <=> ${journalVectorLiteral(embedding)}::vector, e."journalDate" DESC
    LIMIT ${maxResults}
  `);

  return rows
    .filter((row) => row.sourceHash === journalEmbeddingSourceHash(row.sourceNote))
    .slice(0, limit)
    .map(({ entryId, journalDate, mood, content, distance }) => ({
      entryId,
      journalDate,
      mood,
      content,
      score: 1 - distance,
    }));
}
