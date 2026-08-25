import { describe, expect, it, vi } from 'vitest';
import { normalizePolishedText, requestPolishedEntry } from './polish';

describe('normalizePolishedText', () => {
  it('removes a complete leading reasoning block', () => {
    expect(normalizePolishedText('<think>reasoning here</think>Final polished entry.'))
      .toBe('Final polished entry.');
  });

  it('removes malformed and adjacent reasoning blocks', () => {
    expect(normalizePolishedText(
      '<think>**Revising a personal narrative draft****Refining narrative...**</think>\n'
      + '<think>More hidden reasoning.</think>\nFinal entry.',
    )).toBe('Final entry.');
  });

  it('removes stray tags without stripping unrelated markup', () => {
    expect(normalizePolishedText('</think>Final entry.<think>')).toBe('Final entry.');
    expect(normalizePolishedText('A note with <br> preserved.')).toBe('A note with <br> preserved.');
    expect(normalizePolishedText('The <thinker> sculpture was interesting.'))
      .toBe('The <thinker> sculpture was interesting.');
  });

  it('rejects reasoning-only and leading unclosed reasoning output', () => {
    expect(normalizePolishedText('<think>reasoning only</think>')).toBe('');
    expect(normalizePolishedText('<think>reasoning without a close')).toBe('');
  });

  it('keeps valid output intact apart from surrounding whitespace', () => {
    expect(normalizePolishedText('  I had a productive day.  ')).toBe('I had a productive day.');
  });
});

describe('requestPolishedEntry', () => {
  it('fails instead of exposing unusable model output', async () => {
    const client = { complete: vi.fn().mockResolvedValue('<think>only reasoning</think>') };

    await expect(requestPolishedEntry({ note: 'Original draft.', styleStandard: 'Be concise.' }, client))
      .rejects.toThrow('LLM returned no usable polished text.');
  });
});
