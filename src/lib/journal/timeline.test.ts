import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import { listTimelinePage, TIMELINE_PAGE_SIZE } from '@/lib/journal/timeline';

describe('timeline pagination', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('returns stable cursor pages without leaking another user', async () => {
    const user = await testDb.user.create({ data: { email: 'ken@example.com', passwordHash: 'x' } });
    const otherUser = await testDb.user.create({ data: { email: 'other@example.com', passwordHash: 'x' } });
    await testDb.entry.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        userId: user.id,
        date: new Date(Date.UTC(2026, 0, index + 1)),
        localOffset: 480,
        mood: 'RAD' as const,
        note: `Entry ${index + 1}`,
      })),
    });
    await testDb.entry.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-12-31T00:00:00Z'),
        localOffset: 0,
        mood: 'AWFUL',
        note: 'Other user entry.',
      },
    });

    const firstPage = await listTimelinePage(testDb, user.id);
    const secondPage = await listTimelinePage(testDb, user.id, firstPage.nextCursor ?? undefined);
    const ids = [...firstPage.entries, ...secondPage.entries].map((entry) => entry.id);

    expect(firstPage.entries).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.entries).toHaveLength(5);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set(ids).size).toBe(55);
    expect(firstPage.entries.at(-1)?.note).toBe('Entry 6');
    expect(secondPage.entries[0]?.note).toBe('Entry 5');
  });
});
