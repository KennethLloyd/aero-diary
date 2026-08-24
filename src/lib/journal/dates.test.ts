import { describe, expect, it } from 'vitest';
import {
  formatJournalDate,
  getDateKey,
  getJournalDateTime,
  isFutureDateKey,
  isValidDateKey,
} from '@/lib/journal/dates';

describe('journal date utilities', () => {
  const now = new Date('2026-08-24T15:45:12.345Z');
  const localOffset = -420;

  it('validates real calendar dates rather than only date-shaped strings', () => {
    expect(isValidDateKey('2026-08-24')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-8-24')).toBe(false);
  });

  it('builds a backdated UTC instant that keeps the selected local day', () => {
    const stored = getJournalDateTime('2026-08-23', now, localOffset);

    expect(stored).toEqual(new Date('2026-08-23T15:45:12.345Z'));
    expect(getDateKey(stored, localOffset)).toBe('2026-08-23');
  });

  it('rejects only local dates after the current local date', () => {
    expect(isFutureDateKey('2026-08-24', now, localOffset)).toBe(false);
    expect(isFutureDateKey('2026-08-25', now, localOffset)).toBe(true);
    expect(isFutureDateKey('2026-08-23', now, localOffset)).toBe(false);
  });

  it('formats the selected date with a Today prefix only for today', () => {
    expect(formatJournalDate('2026-08-24', '2026-08-24')).toBe('Today · Monday, August 24');
    expect(formatJournalDate('2026-08-23', '2026-08-24')).toBe('Sunday, August 23');
  });
});
