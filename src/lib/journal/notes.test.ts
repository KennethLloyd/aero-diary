import { describe, expect, it } from 'vitest';
import { normalizeJournalNote, splitJournalNoteParagraphs } from '@/lib/journal/notes';

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
});
