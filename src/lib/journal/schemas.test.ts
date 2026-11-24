import { describe, expect, it } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import {
  activityIdSchema,
  activitySchema,
  createEntrySchema,
  polishEntrySchema,
  updateEntrySchema,
} from '@/lib/journal/schemas';

describe('journal schemas', () => {
  it('accepts a valid entry and trims its note and journal date', () => {
    const result = createEntrySchema.safeParse({
      mood: Mood.GOOD,
      note: '  A good day.  ',
      activityIds: ['activity-1'],
      journalDate: ' 2026-08-24 ',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.note).toBe('A good day.');
      expect(result.data.journalDate).toBe('2026-08-24');
      expect(result.data).not.toHaveProperty('localOffset');
    }
  });

  it('rejects malformed and impossible journal dates', () => {
    expect(
      createEntrySchema.safeParse({
        mood: Mood.GOOD,
        note: 'A note.',
        activityIds: [],
        journalDate: '2026-02-30',
      }).success,
    ).toBe(false);
    expect(
      createEntrySchema.safeParse({
        mood: Mood.GOOD,
        note: 'A note.',
        activityIds: [],
        journalDate: '2026-8-24',
      }).success,
    ).toBe(false);
  });

  it('accepts long notes for new and edited entries while preserving the Polish limit', () => {
    const note = 'a'.repeat(20_001);
    const entry = { mood: Mood.GOOD, note, activityIds: [] };

    expect(createEntrySchema.parse(entry).note).toBe(note);
    expect(updateEntrySchema.parse(entry).note).toBe(note);
    expect(polishEntrySchema.safeParse({ note }).success).toBe(false);
  });

  it('rejects invalid moods and empty notes', () => {
    const result = createEntrySchema.safeParse({
      mood: 'unknown',
      note: '   ',
      activityIds: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts and normalizes activity fields', () => {
    const result = activitySchema.safeParse({ name: '  Work  ', emoji: ' 💻 ' });

    expect(result).toMatchObject({
      success: true,
      data: { name: 'Work', emoji: '💻' },
    });
  });

  it('rejects blank or oversized activity identifiers', () => {
    expect(activityIdSchema.safeParse('   ').success).toBe(false);
    expect(activityIdSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});
