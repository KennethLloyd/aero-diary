import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {},
  getCachedTimelinePage: vi.fn(),
  listTimelinePage: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/journal/timeline', () => ({
  getCachedTimelinePage: mocks.getCachedTimelinePage,
  listTimelinePage: mocks.listTimelinePage,
}));

import { loadTimelinePage } from '@/actions/timeline';

const emptyPage = { entries: [], nextCursor: null };

describe('loadTimelinePage action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
  });

  it('uses a fresh database read for reconciliation requests', async () => {
    const filter = { activityId: 'activity-1' };
    mocks.listTimelinePage.mockResolvedValue(emptyPage);

    await expect(loadTimelinePage(undefined, filter, ['entry-1'])).resolves.toBe(emptyPage);

    expect(mocks.listTimelinePage).toHaveBeenCalledWith(
      mocks.db,
      'user-1',
      undefined,
      filter,
      ['entry-1'],
    );
    expect(mocks.getCachedTimelinePage).not.toHaveBeenCalled();
  });

  it('uses the cached read for normal timeline requests', async () => {
    mocks.getCachedTimelinePage.mockResolvedValue(emptyPage);

    await expect(loadTimelinePage('entry-1', {})).resolves.toBe(emptyPage);

    expect(mocks.getCachedTimelinePage).toHaveBeenCalledWith('user-1', 'entry-1', {});
    expect(mocks.listTimelinePage).not.toHaveBeenCalled();
  });
});
