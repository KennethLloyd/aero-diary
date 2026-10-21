import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import { db } from '@/lib/db';
import { getPhotoMemoryConfig } from './photo-memory-config';
import { getPhotoMemoryPreprocessingVersion } from './photo-memory-images';
import {
  embedJournalQuery,
  JOURNAL_EMBEDDING_GENERATION,
  journalVectorLiteral,
} from '@/lib/journal/memory-embeddings';

import {
  JOURNAL_RETRIEVAL_MODES,
  TEMPORAL_RELEVANCE_MARGIN,
  SEMANTIC_CANDIDATE_LIMIT,
  RECENT_CANDIDATE_LIMIT,
  PERIOD_CANDIDATE_LIMIT,
  selectJournalEvidence,
  type JournalRetrievalMode,
  type JournalMemoryCandidate,
  type JournalMemoryResult,
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
  const demoFilter = demoEmail ? Prisma.sql`AND lower(u."email") <> ${demoEmail}` : Prisma.empty;

  const vector = journalVectorLiteral(embedding);
  // A semantic top-K alone can omit every recent or middle-period entry.
  // Add a bounded temporal slice over similarly relevant entries inside PostgreSQL.
  const temporalCandidates =
    mode === 'recent'
      ? Prisma.sql`SELECT * FROM periods ORDER BY "journalDate" DESC, distance, "entryId" LIMIT ${RECENT_CANDIDATE_LIMIT}`
      : mode === 'longitudinal'
        ? Prisma.sql`SELECT "entryId", "journalDate", mood, content, distance, sources, period FROM (
          SELECT *, row_number() OVER (PARTITION BY period ORDER BY distance, "journalDate" DESC, "entryId") AS rank
          FROM periods
        ) ranked WHERE rank <= ${PERIOD_CANDIDATE_LIMIT}`
        : Prisma.sql`SELECT * FROM periods WHERE false`;

  const semanticCandidates =
    mode === 'relevance'
      ? Prisma.sql`SELECT *, 0::int AS period FROM best_passages
        ORDER BY distance, "journalDate" DESC, "entryId" LIMIT ${limit}`
      : Prisma.sql`SELECT b.*, COALESCE(p.period, 0)::int AS period FROM best_passages b
        LEFT JOIN periods p USING ("entryId")
        ORDER BY b.distance, b."journalDate" DESC, b."entryId" LIMIT ${SEMANTIC_CANDIDATE_LIMIT}`;

  const photoCandidates = getPhotoMemoryConfig().retrievalEnabled
    ? Prisma.sql`UNION ALL
      SELECT e."id" AS "entryId", e."journalDate", e."mood", left(e."note", 1200) AS content,
        (m."embedding" <=> ${vector}::vector)::float AS distance,
        'photo'::text AS "sourceType", NULL::int AS "passageIndex", p."id" AS "photoId"
      FROM "JournalPhotoMemory" m
      JOIN "Photo" p ON p."id" = m."photoId" AND p."entryId" = m."entryId"
      JOIN "Entry" e ON e."id" = p."entryId" AND e."userId" = m."userId"
      JOIN "User" u ON u."id" = e."userId"
      WHERE m."userId" = ${userId} AND e."userId" = ${userId}
        AND m."status" = 'INDEXED' AND m."embedding" IS NOT NULL
        AND m."embeddingModel" = ${JOURNAL_EMBEDDING_GENERATION.model}
        AND m."preprocessingVersion" = ${getPhotoMemoryPreprocessingVersion()}
        AND m."sourceUpdatedAt" = p."updatedAt" AND m."sourceVersion" = p."sourceVersion"
        ${demoFilter}`
    : Prisma.empty;

  const rows = await db.$queryRaw<JournalMemoryRow[]>(Prisma.sql`
    WITH evidence AS (
      SELECT e."id" AS "entryId", e."journalDate", e."mood", p."content",
        (p."embedding" <=> ${vector}::vector)::float AS distance,
        'text'::text AS "sourceType", p."passageIndex", NULL::text AS "photoId"
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
      ${photoCandidates}
    ), ranked_evidence AS (
      SELECT *, row_number() OVER (
        PARTITION BY "entryId", "sourceType" ORDER BY distance, "passageIndex", "photoId"
      ) AS source_rank FROM evidence
    ), grouped_sources AS (
      SELECT "entryId", jsonb_agg(
        CASE WHEN "sourceType" = 'text'
          THEN jsonb_build_object('sourceType', 'text', 'passageIndex', "passageIndex", 'similarity', 1 - distance)
          ELSE jsonb_build_object('sourceType', 'photo', 'photoId', "photoId", 'similarity', 1 - distance)
        END ORDER BY distance, "photoId"
      ) AS sources FROM ranked_evidence
      WHERE ("sourceType" = 'text' AND source_rank = 1)
        OR ("sourceType" = 'photo' AND source_rank <= 3)
      GROUP BY "entryId"
    ), best_passages AS (
      SELECT DISTINCT ON (r."entryId")
        r."entryId", r."journalDate", r.mood, COALESCE(t.content, r.content) AS content, r.distance, g.sources
      FROM ranked_evidence r JOIN grouped_sources g USING ("entryId")
      LEFT JOIN ranked_evidence t ON t."entryId" = r."entryId"
        AND t."sourceType" = 'text' AND t.source_rank = 1
      ORDER BY r."entryId", r.distance, r."sourceType", r."passageIndex", r."photoId"
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

  return selectJournalEvidence(
    rows.map(({ distance, ...item }) => ({
      ...item,
      score: 1 - distance,
    })),
    mode,
    limit,
  );
}
