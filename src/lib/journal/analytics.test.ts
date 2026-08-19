import { describe, expect, it } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import {
  buildCalendarGrid,
  getEntryDateKey,
  getMonthFromParam,
  getNextMonth,
  getPreviousMonth,
  summarizeInsights,
  type JournalEntry,
} from '@/lib/journal/analytics';

function entry(
  id: string,
  date: string,
  mood: Mood,
  activities: JournalEntry['activities'] = [],
  localOffset = 0,
): JournalEntry {
  return { id, date: new Date(date), localOffset, mood, activities };
}

describe('journal analytics', () => {
  it('parses a valid month and falls back for invalid navigation values', () => {
    expect(getMonthFromParam('2026-08', new Date('2026-08-19T00:00:00.000Z'))).toEqual({
      key: '2026-08',
      year: 2026,
      month: 8,
    });
    expect(getMonthFromParam('2026-13', new Date('2026-08-19T00:00:00.000Z'))).toEqual({
      key: '2026-08',
      year: 2026,
      month: 8,
    });
  });

  it('moves calendar navigation across year boundaries', () => {
    const january = getMonthFromParam('2026-01', new Date('2026-08-19T00:00:00.000Z'));
    expect(getPreviousMonth(january)).toMatchObject({ key: '2025-12' });
    expect(getNextMonth(january)).toMatchObject({ key: '2026-02' });
  });

  it('builds a seven-column grid with logged-day moods and the today ring', () => {
    const month = getMonthFromParam('2026-08', new Date('2026-08-19T00:00:00.000Z'));
    const grid = buildCalendarGrid(
      [
        entry('entry-1', '2026-08-18T10:00:00.000Z', Mood.GOOD, [], 480),
        entry('entry-2', '2026-08-19T01:00:00.000Z', Mood.RAD),
      ],
      month,
      '2026-08-19',
    );

    expect(grid).toHaveLength(42);
    expect(grid.filter(Boolean).length).toBe(31);
    expect(grid[6]).toMatchObject({ date: '2026-08-01', day: 1 });
    expect(grid.find((day) => day?.date === '2026-08-18')).toMatchObject({
      entryIds: ['entry-1'],
      moods: [Mood.GOOD],
    });
    expect(grid.find((day) => day?.date === '2026-08-19')).toMatchObject({
      isToday: true,
      entryIds: ['entry-2'],
      moods: [Mood.RAD],
    });
    expect(getEntryDateKey(entry('local', '2026-07-31T23:30:00.000Z', Mood.MEH, [], 120))).toBe(
      '2026-08-01',
    );
  });

  it('summarizes all five moods and ranks activities by entry count', () => {
    const insights = summarizeInsights([
      entry('one', '2026-08-01T00:00:00.000Z', Mood.RAD, [
        { activityId: 'work', activity: { name: 'Work', emoji: '💻' } },
        { activityId: 'trail', activity: { name: 'Trail', emoji: '🌲' } },
      ]),
      entry('two', '2026-08-02T00:00:00.000Z', Mood.RAD, [
        { activityId: 'work', activity: { name: 'Work', emoji: '💻' } },
      ]),
      entry('three', '2026-08-03T00:00:00.000Z', Mood.BAD, [
        { activityId: 'trail', activity: { name: 'Trail', emoji: '🌲' } },
      ]),
    ]);

    expect(insights.moods).toEqual([
      { mood: Mood.AWFUL, count: 0, percentage: 0 },
      { mood: Mood.BAD, count: 1, percentage: 33 },
      { mood: Mood.MEH, count: 0, percentage: 0 },
      { mood: Mood.GOOD, count: 0, percentage: 0 },
      { mood: Mood.RAD, count: 2, percentage: 67 },
    ]);
    expect(insights.activities).toEqual([
      { activityId: 'trail', name: 'Trail', emoji: '🌲', count: 2 },
      { activityId: 'work', name: 'Work', emoji: '💻', count: 2 },
    ]);
  });
});
