import { describe, expect, it } from 'vitest';
import {
  formatDateKey,
  formatJournalDate,
  getTodayDateKey,
  isFutureDateKey,
  isValidDateKey,
  journalDateFromDate,
  parseJournalDate,
} from '@/lib/journal/dates';


describe('journal date utilities', () => {
  const now = new Date('2026-08-24T15:45:12.345Z');

  it('validates real calendar dates rather than only date-shaped strings', () => {
    expect(isValidDateKey('2026-08-24')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-8-24')).toBe(false);
  });

  it('keeps journal dates canonical instead of deriving them from an instant', () => {
    expect(getTodayDateKey(new Date('2026-08-24T23:45:12.345Z'))).toBe('2026-08-24');
    expect(getTodayDateKey(new Date('2026-08-25T00:15:12.345Z'))).toBe('2026-08-25');
    expect(journalDateFromDate(new Date('2026-08-24T23:45:12.345Z'))).toBe('2026-08-24');
  });

  it('parses only valid canonical journal dates', () => {
    expect(parseJournalDate('2026-08-24')).toBe('2026-08-24');
    expect(() => parseJournalDate('2026-02-30')).toThrow('Invalid journal date.');
  });

  it('rejects only date keys after the current UTC date', () => {
    expect(isFutureDateKey(parseJournalDate('2026-08-24'), now)).toBe(false);
    expect(isFutureDateKey(parseJournalDate('2026-08-25'), now)).toBe(true);
    expect(isFutureDateKey(parseJournalDate('2026-08-23'), now)).toBe(false);
  });

  it('formats the selected date with a Today prefix only for today', () => {
    expect(formatDateKey(parseJournalDate('2026-08-24'))).toBe('Monday, August 24, 2026');
    expect(formatJournalDate(parseJournalDate('2026-08-24'), parseJournalDate('2026-08-24'))).toBe('Today · Monday, August 24, 2026');
    expect(formatJournalDate(parseJournalDate('2026-08-23'), parseJournalDate('2026-08-24'))).toBe('Sunday, August 23, 2026');
  });
});
