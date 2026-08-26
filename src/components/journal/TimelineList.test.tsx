import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { TimelineList } from '@/components/journal/TimelineList';
import type { TimelinePage } from '@/lib/journal/timeline';

vi.mock('@/actions/timeline', () => ({
  loadTimelinePage: vi.fn(),
}));

function page(id: string, note: string): TimelinePage {
  return {
    entries: [{
      id,
      journalDate: '2026-08-25',
      date: 'Tuesday, August 25',
      mood: Mood.GOOD,
      note,
      tags: [],
    }],
    nextCursor: null,
  };
}
describe('TimelineList', () => {
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
