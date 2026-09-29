import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import { db } from '@/lib/db';
import {
  embedJournalQuery,
  JOURNAL_EMBEDDING_GENERATION,
  journalVectorLiteral,
} from '@/lib/journal/memory-embeddings';

import {
  JOURNAL_RETRIEVAL_MODES, TEMPORAL_RELEVANCE_MARGIN, SEMANTIC_CANDIDATE_LIMIT,
  RECENT_CANDIDATE_LIMIT, PERIOD_CANDIDATE_LIMIT, selectJournalEvidence,
  type JournalRetrievalMode, type JournalMemoryCandidate, type JournalMemoryResult,
} from './memory-selection';

export type { JournalMemoryResult } from './memory-selection';

const journalMemoryQuerySchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(8).default(8),
  mode: z.enum(JOURNAL_RETRIEVAL_MODES).default('relevance'),
});

type JournalMemoryRow = Omit<JournalMemoryCandidate, 'score'> & { distance: number };

export async function retrieveJournalMemoryForUser(
  userId: string,
  input: { query: string; limit?: number; mode?: JournalRetrievalMode },
  signal?: AbortSignal,
): Promise<JournalMemoryResult[]> {
  const { query, limit, mode } = journalMemoryQuerySchema.parse(input);
  const demoEmail = getDemoCredentials()?.email;
  const embedding = await embedJournalQuery(query, fetch, signal);
  const demoFilter = demoEmail
    ? Prisma.sql`AND lower(u."email") <> ${demoEmail}`
    : Prisma.empty;

  const vector = journalVectorLiteral(embedding);
  // A semantic top-K alone can omit every recent or middle-period entry.
  // Add a bounded temporal slice over similarly relevant entries inside PostgreSQL.
  const temporalCandidates = mode === 'recent'
    ? Prisma.sql`SELECT * FROM periods ORDER BY "journalDate" DESC, distance, "entryId" LIMIT ${RECENT_CANDIDATE_LIMIT}`
    : mode === 'longitudinal'
      ? Prisma.sql`SELECT "entryId", "journalDate", mood, content, distance, period FROM (
          SELECT *, row_number() OVER (PARTITION BY period ORDER BY distance, "journalDate" DESC, "entryId") AS rank
          FROM periods
        ) ranked WHERE rank <= ${PERIOD_CANDIDATE_LIMIT}`
      : Prisma.sql`SELECT * FROM periods WHERE false`;

  const semanticCandidates = mode === 'relevance'
    ? Prisma.sql`SELECT *, 0::int AS period FROM best_passages
        ORDER BY distance, "journalDate" DESC, "entryId" LIMIT ${limit}`
    : Prisma.sql`SELECT b.*, COALESCE(p.period, 0)::int AS period FROM best_passages b
        LEFT JOIN periods p USING ("entryId")
        ORDER BY b.distance, b."journalDate" DESC, b."entryId" LIMIT ${SEMANTIC_CANDIDATE_LIMIT}`;

  const rows = await db.$queryRaw<JournalMemoryRow[]>(Prisma.sql`
    WITH best_passages AS (
      SELECT DISTINCT ON (e."id")
        e."id" AS "entryId", e."journalDate", e."mood", p."content",
        (p."embedding" <=> ${vector}::vector)::float AS distance
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
      ORDER BY e."id", distance, p."passageIndex"
    ), relevant AS (
      SELECT * FROM best_passages
      WHERE distance <= (SELECT min(distance) FROM best_passages) + ${TEMPORAL_RELEVANCE_MARGIN}
    ), periods AS (
      SELECT *, LEAST(2, FLOOR(
        3.0 * ("journalDate"::date - min("journalDate"::date) OVER ()) /
        GREATEST(1, max("journalDate"::date) OVER () - min("journalDate"::date) OVER ())
      ))::int AS period FROM relevant
    ), semantic AS (
      ${semanticCandidates}
    ), temporal AS (${temporalCandidates})
    SELECT * FROM temporal
    UNION ALL
    SELECT * FROM semantic WHERE "entryId" NOT IN (SELECT "entryId" FROM temporal)
  `);

  return selectJournalEvidence(rows.map(({ distance, ...item }) => ({
    ...item, score: 1 - distance,
  })), mode, limit);
}
