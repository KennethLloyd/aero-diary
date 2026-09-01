import { act, cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { parseJournalDate } from '@/lib/journal/dates';
import { loadTimelinePage } from '@/actions/timeline';
import { TimelineList } from '@/components/journal/TimelineList';
import type { TimelinePage } from '@/lib/journal/timeline';

vi.mock('@/actions/timeline', () => ({
  loadTimelinePage: vi.fn(),
}));

type TimelineTag = TimelinePage['entries'][number]['tags'][number];

function page(
  id: string,
  note: string,
  { activityInferencePending = false, tags = [] }: {
    activityInferencePending?: boolean
    tags?: TimelineTag[]
  } = {},
): TimelinePage {
  return {
    entries: [{
      id,
      journalDate: parseJournalDate('2026-08-25'),
      date: 'Tuesday, August 25, 2026',
      mood: Mood.GOOD,
      note,
      tags,
      activityInferencePending,
    }],
    nextCursor: null,
  };
}
describe('TimelineList', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
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

  it('reconciles inferred activities into a pending entry without navigation', async () => {
    vi.useFakeTimers();
    try {
      const initialPage = page('entry-1', 'A pending entry.', { activityInferencePending: true });
      const freshPage = page('entry-1', 'A pending entry.', {
        tags: [{ id: 'activity-1', emoji: '💻', name: 'Work' }],
      });
      vi.mocked(loadTimelinePage).mockResolvedValue(freshPage);

      render(<TimelineList initialPage={initialPage} />);
      expect(screen.queryByRole('img', { name: '💻 Work' })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.getByRole('img', { name: '💻 Work' })).toBeVisible();
      expect(loadTimelinePage).toHaveBeenCalledWith(undefined, {}, ['entry-1']);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(loadTimelinePage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops reconciliation after a refresh failure', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(loadTimelinePage).mockRejectedValue(new Error('refresh failed'));
      render(<TimelineList initialPage={page('entry-1', 'A pending entry.', {
        activityInferencePending: true,
      })} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });

      expect(loadTimelinePage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes a pending entry already loaded beyond the first page', async () => {
    vi.useFakeTimers();
    try {
      const filter = { activityId: 'activity-filter' };
      const firstEntry = page('entry-1', 'Newest entry.', {
        tags: [{ id: 'activity-filter', emoji: '🌲', name: 'Trail' }],
      });
      const pendingEntry = page('entry-2', 'Loaded older entry.', {
        activityInferencePending: true,
        tags: [{ id: 'activity-filter', emoji: '🌲', name: 'Trail' }],
      });
      const initialPage = {
        ...firstEntry,
        entries: [...firstEntry.entries, ...pendingEntry.entries],
      };
      const freshPendingEntry = page('entry-2', 'Loaded older entry.', {
        tags: [
          { id: 'activity-filter', emoji: '🌲', name: 'Trail' },
          { id: 'activity-2', emoji: '💻', name: 'Work' },
        ],
      });
      vi.mocked(loadTimelinePage).mockResolvedValue(freshPendingEntry);

      render(<TimelineList initialPage={initialPage} filter={filter} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.getByText('Newest entry.')).toBeVisible();
      expect(screen.getByRole('img', { name: '💻 Work' })).toBeVisible();
      expect(loadTimelinePage).toHaveBeenCalledWith(undefined, filter, ['entry-2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes a pending entry when reconciliation confirms it was deleted', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(loadTimelinePage).mockResolvedValue({ entries: [], nextCursor: null });
      render(<TimelineList initialPage={page('entry-1', 'Deleted entry.', {
        activityInferencePending: true,
      })} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.queryByText('Deleted entry.')).not.toBeInTheDocument();
      expect(loadTimelinePage).toHaveBeenCalledWith(undefined, {}, ['entry-1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconcile after the component unmounts', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<TimelineList initialPage={page('entry-1', 'Pending entry.', {
        activityInferencePending: true,
      })} />);
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(loadTimelinePage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
