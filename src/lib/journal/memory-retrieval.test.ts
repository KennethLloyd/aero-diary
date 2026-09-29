import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import {
  JOURNAL_EMBEDDING_DIMENSIONS, JOURNAL_EMBEDDING_GENERATION, journalVectorLiteral,
} from './memory-embeddings';

vi.mock('@/lib/db', () => ({ db: testDb }));
vi.mock('./memory-embeddings', async (original) => ({
  ...await original<typeof import('./memory-embeddings')>(),
  embedJournalQuery: vi.fn(async () => [1, ...Array(767).fill(0)]),
}));

import { retrieveJournalMemoryForUser } from './memory-retrieval';
import type { JournalRetrievalMode } from './memory-selection';

let ownerId: string;
async function entry(date: string, content: string, scores: number[], userId = ownerId) {
  const record = await testDb.entry.create({
    data: { userId, journalDate: date, mood: 'GOOD', note: content },
  });
  await testDb.journalMemoryGeneration.create({
    data: { entryId: record.id, userId, sourceHash: 'synthetic', embeddingModel: JOURNAL_EMBEDDING_GENERATION.model, passageVersion: JOURNAL_EMBEDDING_GENERATION.passageVersion },
  });
  for (const [index, score] of scores.entries()) {
    const vector = [score, Math.sqrt(1 - score * score), ...Array(JOURNAL_EMBEDDING_DIMENSIONS - 2).fill(0)];
    await testDb.$executeRaw`
      INSERT INTO "JournalMemoryPassage" ("generationId", "userId", "passageIndex", "content", "embedding")
      VALUES (${record.id}, ${userId}, ${index}, ${`${content} Passage ${index}.`}, ${journalVectorLiteral(vector)}::vector)
    `;
  }
  return record.id;
}

async function history() {
  await entry('2023-01-01', 'I felt angry and neglected by Alex.', [0.96, 0.95, 0.94]);
  await entry('2024-01-01', 'Alex and I argued. I was hurt and upset.', [0.93]);
  await entry('2025-01-01', 'Alex and I got engaged.', [0.84]);
  await entry('2026-06-01', 'Alex and I planned our wedding.', [0.81]);
  await entry('2026-07-01', 'Alex and I spent a peaceful weekend together.', [0.80]);
  await entry('2026-08-01', 'Alex and I talked about our future.', [0.79]);
  await entry('2026-09-29', 'I replaced my laptop battery.', [0.20]);
}

const retrieve = (mode: JournalRetrievalMode, query = 'What do I feel about Alex?', limit = 6) =>
  retrieveJournalMemoryForUser(ownerId, { query, mode, limit });

describe('journal evidence selection through PostgreSQL', () => {
  beforeEach(async () => {
    await resetTestDb();
    const user = await testDb.user.create({ data: { email: 'synthetic@example.test', passwordHash: 'x' } });
    ownerId = user.id;
  });

  it.each(['relevance', 'recent', 'longitudinal'] as const)('keeps only the best passage per entry in %s mode', async (mode) => {
    const old = await entry('2023-01-01', 'Alex and I had a difficult day.', [0.95, 0.99, 0.97]);
    for (let year = 2024; year <= 2026; year += 1) {
      await entry(`${year}-01-01`, 'Alex and I spent time together.', [0.90]);
    }
    const results = await retrieve(mode);
    expect(results).toHaveLength(4);
    expect(new Set(results.map((r) => r.entryId)).size).toBe(4);
    expect(results.find((r) => r.entryId === old)?.content).toContain('Passage 1.');
  });

  it('preserves a specific restaurant lookup and defaults to semantic relevance', async () => {
    const restaurant = await entry('2024-02-01', 'Alex and I visited Moonlight Ramen in Kyoto.', [0.98]);
    for (let index = 0; index < 20; index += 1) {
      await entry('2026-09-01', `Unrelated laptop maintenance ${index}.`, [0.10]);
    }
    const results = await retrieveJournalMemoryForUser(ownerId, { query: 'What restaurant did I visit with Alex?' });
    expect(results[0]?.entryId).toBe(restaurant);
    expect(results[0]?.score).toBeCloseTo(0.98);
  });

  it('represents current relationship context alongside historical contrast', async () => {
    await history();
    const results = await retrieve('recent');
    expect(new Set(results.map((r) => r.entryId)).size).toBe(results.length);
    expect(results.filter((r) => r.journalDate.startsWith('2026'))).toHaveLength(3);
    expect(results.some((r) => r.journalDate.startsWith('2023'))).toBe(true);
    expect(results.some((r) => r.content.includes('wedding'))).toBe(true);
    expect(results.every((r) => !r.content.includes('laptop'))).toBe(true);
  });

  it('spans earlier, middle and recent history for evolution questions', async () => {
    await history();
    const results = await retrieve('longitudinal', 'How has my relationship with Alex evolved?');
    expect(results.some((r) => r.journalDate.startsWith('2023'))).toBe(true);
    expect(results.some((r) => r.journalDate.startsWith('2024'))).toBe(true);
    expect(results.some((r) => r.journalDate.startsWith('2026'))).toBe(true);
    expect(results.every((r) => !r.content.includes('laptop'))).toBe(true);
  });

  it.each(['recent', 'longitudinal'] as const)('reaches temporal evidence outside the semantic top 64 in %s mode', async (mode) => {
    for (let index = 0; index < 70; index += 1) {
      await entry('2023-01-01', `Alex and I argued about issue ${index}.`, [0.96 - index / 10000]);
    }
    await entry('2024-07-01', 'Alex and I learned to communicate.', [0.85]);
    await entry('2026-06-01', 'Alex and I planned our wedding.', [0.81]);
    await entry('2026-07-01', 'Alex and I enjoyed time together.', [0.80]);
    await entry('2026-08-01', 'Alex and I discussed our future.', [0.79]);
    const results = await retrieve(mode);
    expect(results).toHaveLength(6);
    expect(results.some((r) => r.journalDate.startsWith('2026'))).toBe(true);
    if (mode === 'recent') expect(results.filter((r) => r.journalDate.startsWith('2026'))).toHaveLength(3);
    else expect(results.some((r) => r.journalDate.startsWith('2024'))).toBe(true);
  });

  it.each(['relevance', 'recent', 'longitudinal'] as const)('returns empty results without memories and respects a one-item limit in %s mode', async (mode) => {
    expect(await retrieve(mode)).toEqual([]);
    await history();
    expect(await retrieve(mode, 'Alex', 1)).toHaveLength(1);
  });

  it.each(['recent', 'longitudinal'] as const)('does not pad sparse %s evidence with unrelated recent entries', async (mode) => {
    const relevant = await entry('2023-01-01', 'Alex and I spent time together.', [0.90]);
    await entry('2026-09-29', 'I replaced my laptop battery.', [0.20]);
    await entry('2026-09-28', 'I watered my plants.', [0.10]);
    const results = await retrieve(mode);
    expect(results.map((r) => r.entryId)).toEqual([relevant]);
  });

  it('excludes the configured demo account even for temporal retrieval', async () => {
    vi.stubEnv('DEMO_EMAIL', 'demo95@example.test');
    vi.stubEnv('DEMO_PASSWORD', 'synthetic-demo-only');
    try {
      const demo = await testDb.user.create({ data: { email: 'demo95@example.test', passwordHash: 'x' } });
      await entry('2026-09-29', 'Alex and a demo user.', [1], demo.id);
      expect(await retrieveJournalMemoryForUser(demo.id, { query: 'Alex', mode: 'recent' })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('excludes another owner and incompatible embedding generations', async () => {
    await history();
    const other = await testDb.user.create({ data: { email: 'other@example.test', passwordHash: 'x' } });
    const foreign = await entry('2026-09-28', 'Alex and another owner.', [1], other.id);
    const stale = await entry('2026-09-27', 'Alex and stale evidence.', [1]);
    await testDb.journalMemoryGeneration.update({ where: { entryId: stale }, data: { passageVersion: 'obsolete' } });
    const results = await retrieve('recent');
    expect(results.every((r) => r.entryId !== foreign && r.entryId !== stale)).toBe(true);
  });
});
