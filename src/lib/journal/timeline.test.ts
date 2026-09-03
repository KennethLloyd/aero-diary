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

  it('trims valid note queries while keeping other filters when a query is inactive', () => {
    expect(parseTimelineFilter({ mood: 'GOOD', q: '  quiet morning  ' })).toEqual({
      mood: 'GOOD',
      query: 'quiet morning',
    });
    expect(parseTimelineFilter({ mood: 'GOOD', q: ' '.repeat(4) })).toEqual({
      mood: 'GOOD',
    });
    expect(parseTimelineFilter({ mood: 'GOOD', q: 'x'.repeat(201) })).toEqual({
      mood: 'GOOD',
    });
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
    expect(firstPage.entries.at(-1)?.note).toBe('Entry 31');
    expect(secondPage.entries[0]?.note).toBe('Entry 30');
    expect(secondPage.entries.at(-1)?.note).toBe('Entry 6');
    expect(thirdPage.entries[0]?.note).toBe('Entry 5');
  });

  it('matches only owned notes with a case-insensitive literal phrase', async () => {
    const user = await testDb.user.create({ data: { email: 'search-owner@example.com', passwordHash: 'x' } });
    const otherUser = await testDb.user.create({ data: { email: 'search-other@example.com', passwordHash: 'x' } });
    const metadataActivity = await testDb.activity.create({
      data: { userId: user.id, name: 'quiet morning', emoji: '🌅' },
    });

    const matchingEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-20',
        mood: 'GOOD',
        note: 'A QUIET MORNING helped me focus.',
        activities: { create: [{ activityId: metadataActivity.id }] },
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-21',
        mood: 'GOOD',
        note: 'The morning was busy.',
        activities: { create: [{ activityId: metadataActivity.id }] },
      },
    });
    const noteOnlyEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-22',
        mood: 'GOOD',
        note: 'A quiet morning happened for someone else.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-23',
        mood: 'GOOD',
        note: 'A quiet morning in another private journal.',
      },
    });

    const noteMatches = await listTimelinePage(testDb, user.id, undefined, { query: 'quiet morning' });

    expect(noteMatches.entries.map((entry) => entry.id)).toEqual([noteOnlyEntry.id, matchingEntry.id]);

    const result = await listTimelinePage(testDb, user.id, undefined, {
      mood: 'GOOD',
      activityId: metadataActivity.id,
      query: 'quiet morning',
    });

    expect(result.entries.map((entry) => entry.id)).toEqual([matchingEntry.id]);
  });

  it('continues note matches through the existing 25-entry cursor pages', async () => {
    const user = await testDb.user.create({ data: { email: 'search-pages@example.com', passwordHash: 'x' } });
    await testDb.entry.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        userId: user.id,
        journalDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        mood: 'RAD' as const,
        note: `A shared phrase appears in entry ${index + 1}.`,
      })),
    });

    const firstPage = await listTimelinePage(testDb, user.id, undefined, { query: 'SHARED PHRASE' });
    const secondPage = await listTimelinePage(testDb, user.id, firstPage.nextCursor ?? undefined, { query: 'SHARED PHRASE' });
    const thirdPage = await listTimelinePage(testDb, user.id, secondPage.nextCursor ?? undefined, { query: 'SHARED PHRASE' });

    expect(firstPage.entries).toHaveLength(25);
    expect(secondPage.entries).toHaveLength(25);
    expect(thirdPage.entries).toHaveLength(5);
    expect(thirdPage.nextCursor).toBeNull();
    expect(firstPage.entries[0]?.journalDate).toBe('2026-02-24');
    expect(secondPage.entries[0]?.note).toBe('A shared phrase appears in entry 30.');
    expect(thirdPage.entries[0]?.note).toBe('A shared phrase appears in entry 5.');
  });

  it('treats wildcard-looking query characters as literal note text', async () => {
    const user = await testDb.user.create({ data: { email: 'literal-search@example.com', passwordHash: 'x' } });
    const literalMatch = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-31',
        mood: 'GOOD',
        note: 'A 100% complete day.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-30',
        mood: 'GOOD',
        note: 'A 100x complete day.',
      },
    });

    const result = await listTimelinePage(testDb, user.id, undefined, { query: '100%' });

    expect(result.entries.map((entry) => entry.id)).toEqual([literalMatch.id]);
  });
});
