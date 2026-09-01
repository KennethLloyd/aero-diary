import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import { listTimelinePage, parseTimelineFilter, TIMELINE_PAGE_SIZE } from '@/lib/journal/timeline';

describe('timeline pagination', () => {
  it('parses safe mood and activity filters for actionable insight links', () => {
    expect(parseTimelineFilter({ mood: 'GOOD', activity: 'activity-1' })).toEqual({
      mood: 'GOOD',
      activityId: 'activity-1',
    });
    expect(parseTimelineFilter({ mood: 'unknown', activity: ' ' })).toEqual({});
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  it('returns stable cursor pages without leaking another user', async () => {
    const user = await testDb.user.create({ data: { email: 'ken@example.com', passwordHash: 'x' } });
    const otherUser = await testDb.user.create({ data: { email: 'other@example.com', passwordHash: 'x' } });
    await testDb.entry.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        userId: user.id,
        journalDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        mood: 'RAD' as const,
        note: `Entry ${index + 1}`,
      })),
    });
    await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-12-31',
        mood: 'AWFUL',
        note: 'Other user entry.',
      },
    });

    const firstPage = await listTimelinePage(testDb, user.id);
    const secondPage = await listTimelinePage(testDb, user.id, firstPage.nextCursor ?? undefined);
    const thirdPage = await listTimelinePage(testDb, user.id, secondPage.nextCursor ?? undefined);
    const ids = [...firstPage.entries, ...secondPage.entries, ...thirdPage.entries].map((entry) => entry.id);

    expect(firstPage.entries).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.entries).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(secondPage.nextCursor).toBeTruthy();
    expect(thirdPage.entries).toHaveLength(5);
    expect(thirdPage.nextCursor).toBeNull();
    expect(new Set(ids).size).toBe(55);
    expect(firstPage.entries[0]).toMatchObject({
      journalDate: '2026-02-24',
      date: 'Tuesday, February 24, 2026',
    });
    expect(firstPage.entries[0]).not.toHaveProperty('time');
    expect(firstPage.entries[0]?.activityInferencePending).toBe(false);
    expect(firstPage.entries.at(-1)?.note).toBe('Entry 31');
    expect(secondPage.entries[0]?.note).toBe('Entry 30');
    expect(secondPage.entries.at(-1)?.note).toBe('Entry 6');
    expect(thirdPage.entries[0]?.note).toBe('Entry 5');
  });

  it('returns reconciliation entries outside a filtered page', async () => {
    const user = await testDb.user.create({ data: { email: 'filter@example.com', passwordHash: 'x' } });
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Trail', emoji: '🌲' },
    });
    const pendingEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-01-01',
        mood: 'GOOD',
        note: 'Pending entry outside the filter.',
        activityInferencePending: true,
        activities: { create: [{ activityId: activity.id }] },
      },
    });
    for (let index = 0; index < TIMELINE_PAGE_SIZE; index += 1) {
      await testDb.entry.create({
        data: {
          userId: user.id,
          journalDate: `2026-02-${String(index + 1).padStart(2, '0')}`,
          mood: 'GOOD',
          note: `Filtered entry ${index + 1}`,
          activities: { create: [{ activityId: activity.id }] },
        },
      });
    }

    const refreshedPage = await listTimelinePage(
      testDb,
      user.id,
      undefined,
      { activityId: activity.id },
      [pendingEntry.id],
    );

    expect(refreshedPage.entries).toHaveLength(TIMELINE_PAGE_SIZE + 1);
    expect(refreshedPage.entries.map((entry) => entry.id)).toContain(pendingEntry.id);
    expect(refreshedPage.entries.at(-1)).toMatchObject({
      id: pendingEntry.id,
      activityInferencePending: true,
    });
    expect(refreshedPage.nextCursor).toBeTruthy();
  });

  it('omits reconciliation entries that no longer match the active filter', async () => {
    const user = await testDb.user.create({ data: { email: 'filter-removal@example.com', passwordHash: 'x' } });
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Trail', emoji: '🌲' },
    });
    const pendingEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-01-01',
        mood: 'GOOD',
        note: 'No longer matches.',
        activityInferencePending: true,
      },
    });

    const refreshedPage = await listTimelinePage(
      testDb,
      user.id,
      undefined,
      { activityId: activity.id },
      [pendingEntry.id],
    );

    expect(refreshedPage.entries).toEqual([]);
    expect(refreshedPage.nextCursor).toBeNull();
  });
});
