import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import { processJournalMemoryEntry } from '@/lib/journal/memory-indexer';
import { JOURNAL_EMBEDDING_DIMENSIONS } from '@/lib/journal/memory-embeddings';

function vectorsFor(passages: readonly string[]): number[][] {
  return passages.map(() => Array.from({ length: JOURNAL_EMBEDDING_DIMENSIONS }, () => 0.01));
}

async function createEntry(note: string) {
  const user = await testDb.user.create({
    data: { email: `${crypto.randomUUID()}@example.com`, passwordHash: 'x' },
  });
  const entry = await testDb.entry.create({
    data: { userId: user.id, journalDate: '2026-09-29', mood: Mood.GOOD, note },
  });
  return { user, entry };
}

describe('journal memory indexing', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('stores complete overlapping passages and skips an already-current generation', async () => {
    const note = `A day remembered. ${'🌊'.repeat(1_500)}`;
    const { user, entry } = await createEntry(note);
    const embed = vi.fn(async (passages: readonly string[]) => vectorsFor(passages));

    await expect(processJournalMemoryEntry(testDb, entry.id, user.id, embed)).resolves.toBe('indexed');
    await expect(processJournalMemoryEntry(testDb, entry.id, user.id, embed)).resolves.toBe('current');

    const indexed = await testDb.journalMemoryGeneration.findUniqueOrThrow({
      where: { entryId: entry.id },
      select: {
        sourceHash: true,
        embeddingModel: true,
        passageVersion: true,
        passages: { orderBy: { passageIndex: 'asc' }, select: { passageIndex: true, content: true } },
      },
    });
    expect(indexed.passages.length).toBeGreaterThan(1);
    const passageContents = indexed.passages.map(({ content }) => content);
    const sourceCharacters = Array.from(note);
    expect(passageContents[0]).toBe(sourceCharacters.slice(0, 700).join(''));
    expect(passageContents.at(-1)).toBe(sourceCharacters.slice(-318).join(''));
    for (let index = 1; index < passageContents.length; index += 1) {
      const previous = Array.from(passageContents[index - 1] ?? '');
      const current = Array.from(passageContents[index] ?? '');
      expect(current.slice(0, 100)).toEqual(previous.slice(-100));
    }
    expect(embed).toHaveBeenCalledTimes(1);
    const dimensions = await testDb.$queryRaw<{ dimensions: number }[]>`
      SELECT vector_dims("embedding") AS "dimensions"
      FROM "JournalMemoryPassage"
      WHERE "generationId" = ${entry.id}
      LIMIT 1
    `;
    expect(dimensions[0]?.dimensions).toBe(JOURNAL_EMBEDDING_DIMENSIONS);
  });

  it('discards embeddings when the source note changes during inference', async () => {
    const { user, entry } = await createEntry('This note changes while Ollama is working.');
    const embed = vi.fn(async (passages: readonly string[]) => {
      await testDb.entry.update({ where: { id: entry.id }, data: { note: 'A newer note is now canonical.' } });
      return vectorsFor(passages);
    });

    await expect(processJournalMemoryEntry(testDb, entry.id, user.id, embed)).resolves.toBe('stale');
    await expect(testDb.journalMemoryGeneration.findUnique({ where: { entryId: entry.id } })).resolves.toBeNull();
    await expect(testDb.journalMemoryPassage.count({ where: { generationId: entry.id } })).resolves.toBe(0);
  });

  it('treats an entry deleted during inference as a successful no-op', async () => {
    const { user, entry } = await createEntry('This entry will be deleted during inference.');
    const embed = vi.fn(async (passages: readonly string[]) => {
      await testDb.entry.delete({ where: { id: entry.id } });
      return vectorsFor(passages);
    });

    await expect(processJournalMemoryEntry(testDb, entry.id, user.id, embed)).resolves.toBe('missing');
    await expect(testDb.journalMemoryGeneration.findUnique({ where: { entryId: entry.id } })).resolves.toBeNull();
  });
});
