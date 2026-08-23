const JOURNAL_BREAK_TAG = /<br\s*\/?\s*>/gi;

export function normalizeJournalNote(note: string): string {
  return note.replace(JOURNAL_BREAK_TAG, '\n');
}

export function splitJournalNoteParagraphs(note: string): string[] {
  return normalizeJournalNote(note)
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
