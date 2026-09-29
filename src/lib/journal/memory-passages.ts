export const JOURNAL_PASSAGE_VERSION = 'note-codepoints-700-overlap-100-v1';
export const JOURNAL_PASSAGE_MAX_CODEPOINTS = 700;
export const JOURNAL_PASSAGE_OVERLAP_CODEPOINTS = 100;

export function splitJournalNote(note: string): string[] {
  const characters = Array.from(note);
  if (characters.length === 0) return [];

  const passages: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(start + JOURNAL_PASSAGE_MAX_CODEPOINTS, characters.length);
    if (end < characters.length) {
      const minimumEnd = start + Math.floor(JOURNAL_PASSAGE_MAX_CODEPOINTS * 0.6);
      for (let index = end - 1; index >= minimumEnd; index -= 1) {
        if (/[\s.!?。！？]/u.test(characters[index] ?? '')) {
          end = index + 1;
          break;
        }
      }
    }

    passages.push(characters.slice(start, end).join(''));
    if (end === characters.length) break;
    start = Math.max(start + 1, end - JOURNAL_PASSAGE_OVERLAP_CODEPOINTS);
  }
  return passages;
}

export function journalDocumentPrompt(passage: string): string {
  return `title: none | text: ${passage}`;
}

export function journalQueryPrompt(query: string): string {
  return `task: search result | query: ${query}`;
}
