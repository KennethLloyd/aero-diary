import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateTag: vi.fn() }));

vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }));

import {
  invalidateActivityReads,
  invalidateEntryDetailRead,
  invalidateJournalReads,
} from '@/lib/journal/cache';
describe('journal cache invalidation', () => {
  beforeEach(() => {
    mocks.updateTag.mockClear();
  });
  it('invalidates all read models and one entry detail after an entry mutation', () => {
    invalidateJournalReads('user-1', 'entry-1');

    expect(mocks.updateTag.mock.calls).toEqual([
      ['journal:user-1:timeline'],
      ['journal:user-1:calendar'],
      ['journal:user-1:insights'],
      ['journal:user-1:entry:entry-1'],
    ]);
  });

  it('invalidates only the detail read for a photo mutation', () => {
    invalidateEntryDetailRead('user-1', 'entry-1');

    expect(mocks.updateTag).toHaveBeenCalledWith('journal:user-1:entry:entry-1');
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
  });

  it('adds activity options to the journal read models', () => {
    invalidateActivityReads('user-1');

    expect(mocks.updateTag.mock.calls).toEqual([
      ['journal:user-1:activities'],
      ['journal:user-1:timeline'],
      ['journal:user-1:calendar'],
      ['journal:user-1:insights'],
    ]);
  });
});
