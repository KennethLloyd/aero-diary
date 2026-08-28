import { describe, expect, it, vi } from 'vitest';
import {
  classifyJournalActivities,
  MAX_INFERRED_ACTIVITY_COUNT,
  parseInferredActivityIds,
} from './activity-classifier';

const activities = [
  { id: 'gaming-id', name: 'Gaming' },
  { id: 'dining-id', name: 'Dining' },
  { id: 'coding-id', name: 'Coding' },
];

describe('parseInferredActivityIds', () => {
  it('keeps known IDs, removes duplicates, and ignores unknown IDs', () => {
    expect(parseInferredActivityIds(
      JSON.stringify({ activityIds: ['gaming-id', 'missing-id', 'gaming-id', 'dining-id'] }),
      activities,
    )).toEqual(['gaming-id', 'dining-id']);
  });

  it('rejects malformed or overly broad model output', () => {
    expect(() => parseInferredActivityIds('{"activities":[]}', activities)).toThrow(
      'LLM returned invalid activity classification.',
    );
    expect(() => parseInferredActivityIds(
      JSON.stringify({
        activityIds: Array.from({ length: MAX_INFERRED_ACTIVITY_COUNT + 1 }, (_, index) => `id-${index}`),
      }),
      activities,
    )).toThrow('LLM returned invalid activity classification.');
    expect(() => parseInferredActivityIds(
      JSON.stringify({ activityIds: ['gaming-id'], explanation: 'also selected by the model' }),
      activities,
    )).toThrow('LLM returned invalid activity classification.');
  });
});

describe('classifyJournalActivities', () => {
  it('supports an empty result and sends the available taxonomy to the LLM', async () => {
    const client = { complete: vi.fn().mockResolvedValue('{"activityIds":[]}') };

    await expect(classifyJournalActivities('A quiet day.', activities, client)).resolves.toEqual([]);
    expect(client.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('gaming-id'),
      userPrompt: 'A quiet day.',
    });
  });

  it('does not call the LLM when there are no activities', async () => {
    const client = { complete: vi.fn() };

    await expect(classifyJournalActivities('A quiet day.', [], client)).resolves.toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });
});
