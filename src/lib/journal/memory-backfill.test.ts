import { describe, expect, it } from 'vitest';
import { parseMemoryBackfillOptions, summarizeMemoryBackfill } from './memory-backfill';

describe('manual memory backfill controls', () => {
  it('requires an explicit owner and defaults to a bounded read-only page', () => {
    expect(() => parseMemoryBackfillOptions([], 'text')).toThrow();

    expect(parseMemoryBackfillOptions(['--user-id', 'owner'], 'text')).toMatchObject({
      userId: 'owner',
      limit: 100,
      enqueue: false,
      status: false,
    });
  });

  it('supports explicit canary selection and a resumable cursor', () => {
    const options = parseMemoryBackfillOptions(
      [
        '--user-id',
        'owner',
        '--entry-id',
        'entry-a',
        '--entry-id',
        'entry-b',
        '--photo-id',
        'photo-a',
        '--from',
        '2026-07-16',
        '--to',
        '2026-08-17',
        '--limit',
        '2',
        '--after',
        'previous-photo',
        '--enqueue',
      ],
      'photo',
    );

    expect(options).toMatchObject({
      entryIds: ['entry-a', 'entry-b'],
      photoIds: ['photo-a'],
      limit: 2,
      after: 'previous-photo',
      enqueue: true,
      from: '2026-07-16',
      to: '2026-08-17',
    });
  });

  it.each([
    ['--limit', '0'],
    ['--limit', '1001'],
    ['--limit', '1.5'],
    ['--from', '2026-02-30'],
    ['--from', '2026-08-18', '--to', '2026-08-17'],
    ['--enqueue', '--status'],
    ['--limit'],
    ['--surprise'],
    ['--photo-id', 'photo'],
    ['--user-id', 'another-owner'],
  ])('rejects unsafe or invalid options %j', (...flags) => {
    expect(() => parseMemoryBackfillOptions(['--user-id', 'owner', ...flags], 'text')).toThrow();
  });

  it('reports all practical states without mutating input', () => {
    expect(
      summarizeMemoryBackfill(['current', 'current', 'old', 'missing', 'failed', 'skipped']),
    ).toEqual({ current: 2, old: 1, missing: 1, failed: 1, skipped: 1 });
  });
});
