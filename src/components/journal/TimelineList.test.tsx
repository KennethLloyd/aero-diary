import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { parseJournalDate } from '@/lib/journal/dates';
import { TimelineList } from '@/components/journal/TimelineList';
import type { TimelinePage } from '@/lib/journal/timeline';

vi.mock('@/actions/timeline', () => ({
  loadTimelinePage: vi.fn(),
  refreshTimelinePage: vi.fn(),
  getEntryActivityInferenceStatus: vi.fn(),
}));

import {
  getEntryActivityInferenceStatus,
  loadTimelinePage,
  refreshTimelinePage,
} from '@/actions/timeline';

function page(id: string, note: string): TimelinePage {
  return {
    entries: [{
      id,
      journalDate: parseJournalDate('2026-08-25'),
      date: 'Tuesday, August 25, 2026',
      mood: Mood.GOOD,
      note,
      tags: [],
    }],
    nextCursor: null,
  };
}

const refreshTimelinePageMock = vi.mocked(refreshTimelinePage);
const loadTimelinePageMock = vi.mocked(loadTimelinePage);
const getEntryActivityInferenceStatusMock = vi.mocked(getEntryActivityInferenceStatus);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TimelineList', () => {
  it('centers and highlights the first matching note phrase while keeping the card link', () => {
    const searchedPage = page(
      'entry-1',
      'A long reflection before the quiet phrase appears, followed by a gentle close.',
    );

    render(
      <TimelineList
        initialPage={searchedPage}
        filter={{ query: 'QUIET PHRASE' }}
      />,
    );

    expect(screen.getByRole('link', { name: /quiet phrase/i })).toHaveAttribute('href', '/timeline/entry-1');
    expect(screen.getByText('quiet phrase', { exact: true }).tagName).toBe('MARK');
  });

  it('shows a search-specific no-results state', () => {
    render(
      <TimelineList
        initialPage={{ entries: [], nextCursor: null }}
        filter={{ query: 'missing phrase' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No matching memories found' })).toBeVisible();
    expect(screen.getByText('Try a different phrase or return to your full memory timeline.')).toBeVisible();
  });

  it('reconciles inferred activities after pending enrichment reaches a terminal state', async () => {
    const originalPage = page('entry-1', 'Original entry.');
    const freshPage = {
      ...originalPage,
      entries: [{
        ...originalPage.entries[0],
        tags: [{ id: 'activity-1', emoji: '🌲', name: 'Trail' }],
      }],
    };
    getEntryActivityInferenceStatusMock
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('complete');
    refreshTimelinePageMock.mockResolvedValue(freshPage);

    render(
      <TimelineList
        initialPage={originalPage}
        pendingInferenceId="entry-1"
      />,
    );

    await waitFor(() => expect(screen.getByText('Trail')).toBeVisible(), { timeout: 2_000 });
    expect(refreshTimelinePageMock).toHaveBeenCalledWith({});
  });

  it('retries a transient status read failure before refreshing', async () => {
    const originalPage = page('entry-1', 'Original entry.');
    const freshPage = {
      ...originalPage,
      entries: [{
        ...originalPage.entries[0],
        tags: [{ id: 'activity-1', emoji: '🌲', name: 'Trail' }],
      }],
    };
    getEntryActivityInferenceStatusMock
      .mockRejectedValueOnce(new Error('temporary status failure'))
      .mockResolvedValueOnce('complete');
    refreshTimelinePageMock.mockResolvedValue(freshPage);

    render(
      <TimelineList
        initialPage={originalPage}
        pendingInferenceId="entry-1"
      />,
    );

    await waitFor(() => expect(screen.getByText('Trail')).toBeVisible(), { timeout: 2_000 });
    expect(refreshTimelinePageMock).toHaveBeenCalledWith({});
  });

  it('refreshes once when inference finishes with a failure', async () => {
    const originalPage = page('entry-1', 'Original entry.');
    getEntryActivityInferenceStatusMock.mockResolvedValue('failed');
    refreshTimelinePageMock.mockResolvedValue(originalPage);

    render(
      <TimelineList
        initialPage={originalPage}
        pendingInferenceId="entry-1"
      />,
    );

    await waitFor(() => expect(refreshTimelinePageMock).toHaveBeenCalledWith({}), { timeout: 2_000 });
    expect(getEntryActivityInferenceStatusMock).toHaveBeenCalledTimes(1);
  });

  it('preserves entries loaded before the enrichment refresh', async () => {
    const originalPage = {
      entries: [
        page('entry-1', 'Original entry.').entries[0],
        page('entry-2', 'Older entry.').entries[0],
      ],
      nextCursor: 'older-cursor',
    } satisfies TimelinePage;
    const freshPage = {
      entries: [{
        ...originalPage.entries[0],
        tags: [{ id: 'activity-1', emoji: '🌲', name: 'Trail' }],
      }],
      nextCursor: null,
    } satisfies TimelinePage;
    getEntryActivityInferenceStatusMock.mockResolvedValue('complete');
    refreshTimelinePageMock.mockResolvedValue(freshPage);
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    });

    render(
      <TimelineList
        initialPage={originalPage}
        pendingInferenceId="entry-1"
      />,
    );

    await waitFor(() => expect(screen.getByText('Trail')).toBeVisible(), { timeout: 2_000 });
    expect(screen.getByText('Older entry.')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load older memories' })).toBeVisible(), {
      timeout: 2_000,
    });
  });

  it('keeps pagination pending feedback and prevents duplicate loads', async () => {
    const initialPage = {
      entries: [page('entry-1', 'Newest entry.').entries[0]],
      nextCursor: 'older-cursor',
    } satisfies TimelinePage;
    const nextPage = {
      entries: [page('entry-2', 'Older entry.').entries[0]],
      nextCursor: null,
    } satisfies TimelinePage;
    const load = Promise.withResolvers<TimelinePage>();
    loadTimelinePageMock.mockReturnValue(load.promise);
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    });

    render(<TimelineList initialPage={initialPage} />);

    const button = screen.getByRole('button', { name: 'Load older memories' });
    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveTextContent('Loading older memories…'));
    expect(button).toBeDisabled();
    expect(loadTimelinePageMock).toHaveBeenCalledTimes(1);
    expect(loadTimelinePageMock).toHaveBeenCalledWith('older-cursor', {});

    fireEvent.click(button);
    expect(loadTimelinePageMock).toHaveBeenCalledTimes(1);

    load.resolve(nextPage);

    await waitFor(() => expect(screen.getByText('Older entry.')).toBeVisible());
    expect(screen.getByText('You’re all caught up with your memories.')).toBeVisible();
  });

  it('mounts a fresh client snapshot when the server snapshot changes', () => {
    const originalPage = page('entry-1', 'Original entry.');
    const freshPage = page('entry-1', 'Fresh entry after redirect.');
    const { rerender } = render(
      <TimelineList
        key={JSON.stringify(originalPage)}
        initialPage={originalPage}
      />,
    );

    expect(screen.getByText('Original entry.')).toBeVisible();

    rerender(
      <TimelineList
        key={JSON.stringify(freshPage)}
        initialPage={freshPage}
      />,
    );

    expect(screen.getByText('Fresh entry after redirect.')).toBeVisible();
    expect(screen.queryByText('Original entry.')).not.toBeInTheDocument();
  });
});
