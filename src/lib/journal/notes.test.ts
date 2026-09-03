import { describe, expect, it } from 'vitest';
import {
  getJournalNoteExcerpt,
  normalizeJournalNote,
  splitJournalNoteParagraphs,
} from '@/lib/journal/notes';

describe('journal note formatting', () => {
  it('normalizes journal break tags without interpreting arbitrary HTML', () => {
    expect(normalizeJournalNote('Morning<br>Afternoon<BR/>Evening<br />Night')).toBe(
      'Morning\nAfternoon\nEvening\nNight',
    );
    expect(normalizeJournalNote('Keep <strong>literal</strong> text')).toBe(
      'Keep <strong>literal</strong> text',
    );
  });

  it('splits normalized blank lines into paragraphs', () => {
    expect(splitJournalNoteParagraphs('First<br><br>Second\n\nThird')).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('centers a case-insensitive first match in a bounded note excerpt', () => {
    expect(getJournalNoteExcerpt(
      '0123456789 before the Quiet Phrase and then a long reflection after it.',
      'quiet phrase',
      36,
    )).toEqual({
      before: '… before the ',
      match: 'Quiet Phrase',
      after: ' and then a …',
    });
  });

  it('returns the complete note when there is no active or visible match', () => {
    expect(getJournalNoteExcerpt('A short note.', '   ')).toEqual({
      before: '',
      match: '',
      after: 'A short note.',
    });
    expect(getJournalNoteExcerpt('A short note.', 'missing')).toEqual({
      before: '',
      match: '',
      after: 'A short note.',
    });
  });
});
