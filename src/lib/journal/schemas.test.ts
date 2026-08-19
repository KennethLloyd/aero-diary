import { describe, expect, it } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import {
  activityIdSchema,
  activitySchema,
  createEntrySchema,
} from '@/lib/journal/schemas';

describe('journal schemas', () => {
  it('accepts a valid entry and trims its note', () => {
    const result = createEntrySchema.safeParse({
      mood: Mood.GOOD,
      note: '  A good day.  ',
      activityIds: ['activity-1'],
      localOffset: '480',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe('A good day.');
      expect(result.data.localOffset).toBe(480);
    }
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
