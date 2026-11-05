import { describe, expect, it, vi } from 'vitest';
import { classifyJournalActivities, parseInferredActivityIds } from './activity-classifier';

const activities = [
  { id: 'gaming-id', name: 'Gaming' },
  { id: 'dining-id', name: 'Dining' },
  { id: 'coding-id', name: 'Coding' },
];

describe('parseInferredActivityIds', () => {
  it('keeps known IDs, removes duplicates, and ignores unknown IDs', () => {
    expect(
      parseInferredActivityIds(
        JSON.stringify({ activityIds: ['gaming-id', 'missing-id', 'gaming-id', 'dining-id'] }),
        activities,
      ).activityIds,
    ).toEqual(['gaming-id', 'dining-id']);
  });
  it('normalizes a fenced JSON object before validation', () => {
    expect(
      parseInferredActivityIds('```json\n{"activityIds":["gaming-id"]}\n```', activities)
        .activityIds,
    ).toEqual(['gaming-id']);
  });
  it('normalizes the provider reasoning prefix before strict validation', () => {
    expect(
      parseInferredActivityIds(
        '<think>**Formatting exact JSON output**</think>{"activityIds":["coding-id"]}',
        activities,
      ).activityIds,
    ).toEqual(['coding-id']);
  });
  it('does not accept incomplete or non-leading reasoning prefixes', () => {
    for (const content of [
      '<think>unclosed reasoning{"activityIds":["gaming-id"]}',
      'Prose before <think>reasoning</think>{"activityIds":["gaming-id"]}',
    ]) {
      expect(() => parseInferredActivityIds(content, activities)).toThrow(
        'LLM returned invalid activity classification JSON.',
      );
    }
  });
  it('does not accept prose around a fenced JSON object', () => {
    expect(() =>
      parseInferredActivityIds('```json\n{"activityIds":["gaming-id"]}\n```\nDone.', activities),
    ).toThrow('LLM returned invalid activity classification JSON.');
  });
  it('limits the accepted result to ten activities', () => {
    const manyActivities = Array.from({ length: 11 }, (_, index) => ({
      id: `activity-${index}`,
      name: `Activity ${index}`,
    }));

    expect(
      parseInferredActivityIds(
        JSON.stringify({ activityIds: manyActivities.map((activity) => activity.id) }),
        manyActivities,
      ).activityIds,
    ).toHaveLength(10);
  });

  it('ignores malformed IDs without discarding valid classifications', () => {
    expect(
      parseInferredActivityIds(
        JSON.stringify({
          activityIds: ['gaming-id', '', null, 42, 'dining-id', 'x'.repeat(101)],
        }),
        activities,
      ).activityIds,
    ).toEqual(['gaming-id', 'dining-id']);
  });

  it('counts returned, invalid, and unknown items separately', () => {
    const classification = parseInferredActivityIds(
      JSON.stringify({
        activityIds: ['gaming-id', 'gaming-id', 'missing-id', 'missing-id', 'other-id', '', 42],
      }),
      activities,
    );

    expect(classification).toEqual({
      activityIds: ['gaming-id'],
      returnedCount: 7,
      invalidCount: 2,
      unknownCount: 2,
    });
  });

  it('reports zero counts for an empty model response', () => {
    expect(parseInferredActivityIds('{"activityIds":[]}', activities)).toEqual({
      activityIds: [],
      returnedCount: 0,
      invalidCount: 0,
      unknownCount: 0,
    });
  });

  it('rejects malformed envelopes and excessively large responses', () => {
    expect(() => parseInferredActivityIds('{"activities":[]}', activities)).toThrow(
      'LLM returned invalid activity classification.',
    );
    expect(() =>
      parseInferredActivityIds(
        JSON.stringify({ activityIds: Array.from({ length: 101 }, () => 'unknown-id') }),
        activities,
      ),
    ).toThrow('LLM returned invalid activity classification.');
    expect(() =>
      parseInferredActivityIds(
        JSON.stringify({ activityIds: ['gaming-id'], explanation: 'also selected by the model' }),
        activities,
      ),
    ).toThrow('LLM returned invalid activity classification.');
    expect(() =>
      parseInferredActivityIds(
        'Here is the classification:\n{"activityIds":["gaming-id"]}',
        activities,
      ),
    ).toThrow('LLM returned invalid activity classification JSON.');
  });
});

describe('classifyJournalActivities', () => {
  it('supports an empty result and sends the available taxonomy to the LLM', async () => {
    const client = { complete: vi.fn().mockResolvedValue('{"activityIds":[]}') };
    await expect(classifyJournalActivities('A quiet day.', activities, client)).resolves.toEqual({
      activityIds: [],
      returnedCount: 0,
      invalidCount: 0,
      unknownCount: 0,
    });

    expect(client.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('gaming-id'),
      userPrompt: 'A quiet day.',
      responseFormat: 'json_object',
    });
  });

  it('does not call the LLM when there are no activities', async () => {
    const client = { complete: vi.fn() };

    await expect(classifyJournalActivities('A quiet day.', [], client)).resolves.toEqual({
      activityIds: [],
      returnedCount: 0,
      invalidCount: 0,
      unknownCount: 0,
    });
    expect(client.complete).not.toHaveBeenCalled();
  });
});
