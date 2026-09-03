const JOURNAL_BREAK_TAG = /<br\s*\/?\s*>/gi;

export type JournalNoteExcerpt = {
  before: string
  match: string
  after: string
}

export function normalizeJournalNote(note: string): string {
  return note.replace(JOURNAL_BREAK_TAG, '\n');
}

export function getJournalNoteExcerpt(
  note: string,
  query?: string,
  maxLength = 240,
): JournalNoteExcerpt {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return { before: '', match: '', after: note };

  const matchIndex = note.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (matchIndex < 0) return { before: '', match: '', after: note };

  const matchEnd = matchIndex + normalizedQuery.length;
  const contextLength = Math.max(0, maxLength - normalizedQuery.length);
  let start = Math.max(0, matchIndex - Math.floor(contextLength / 2));
  const end = Math.min(note.length, Math.max(matchEnd, start + maxLength));
  start = Math.max(0, end - maxLength);

  return {
    before: `${start > 0 ? '…' : ''}${note.slice(start, matchIndex)}`,
    match: note.slice(matchIndex, matchEnd),
    after: `${note.slice(matchEnd, end)}${end < note.length ? '…' : ''}`,
  };
}

export function splitJournalNoteParagraphs(note: string): string[] {
  return normalizeJournalNote(note)
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
