export const JOURNAL_RETRIEVAL_MODES = ['relevance', 'recent', 'longitudinal'] as const;
export type JournalRetrievalMode = typeof JOURNAL_RETRIEVAL_MODES[number];

// Temporal coverage only considers entries within 0.20 cosine score of the best match.
export const TEMPORAL_RELEVANCE_MARGIN = 0.20;
export const SEMANTIC_CANDIDATE_LIMIT = 64;
export const RECENT_CANDIDATE_LIMIT = 24;
export const PERIOD_CANDIDATE_LIMIT = 8;

export type JournalMemoryResult = {
  entryId: string
  journalDate: string
  mood: string
  content: string
  score: number
};

export type JournalMemoryCandidate = JournalMemoryResult & { period: number };

export function selectJournalEvidence(
  candidates: JournalMemoryCandidate[],
  mode: JournalRetrievalMode,
  limit: number,
): JournalMemoryResult[] {
  const ranked = [...candidates].sort((a, b) =>
    b.score - a.score || b.journalDate.localeCompare(a.journalDate) || a.entryId.localeCompare(b.entryId),
  );
  const best = ranked[0];
  if (!best) return [];
  const relevant = ranked.filter((item) => item.score >= best.score - TEMPORAL_RELEVANCE_MARGIN);
  const selected = new Map<string, JournalMemoryResult>();
  const add = (item: JournalMemoryCandidate) => {
    if (selected.size < limit && !selected.has(item.entryId)) {
      const { entryId, journalDate, mood, content, score } = item;
      selected.set(entryId, { entryId, journalDate, mood, content, score });
    }
  };

  if (mode === 'recent') {
    [...relevant].sort((a, b) => b.journalDate.localeCompare(a.journalDate) || b.score - a.score)
      .slice(0, Math.ceil(limit / 2)).forEach(add);
  } else if (mode === 'longitudinal') {
    const periods = [0, 1, 2].map((period) => relevant.filter((item) => item.period === period));
    for (let index = 0; index < limit; index += 1) {
      for (const period of periods) {
        const item = period[index];
        if (item) add(item);
      }
    }
  }
  (mode === 'relevance' ? ranked : relevant).forEach(add);
  return [...selected.values()];
}
