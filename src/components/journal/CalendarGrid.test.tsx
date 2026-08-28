import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalendarGrid } from '@/components/journal/CalendarGrid';
import { Mood } from '@/generated/prisma/enums';
import { parseJournalDate } from '@/lib/journal/dates';

describe('CalendarGrid', () => {
  it('exposes every entry when a day contains multiple memories', () => {
    render(
      <CalendarGrid
        days={[{
          date: parseJournalDate('2026-08-19'),
          day: 19,
          isToday: true,
          entryIds: ['entry-1', 'entry-2'],
          moods: [Mood.GOOD, Mood.RAD],
        }]}
      />,
    );

    const day = screen.getByLabelText('2 entries for 2026-08-19');
    fireEvent.click(day);

    expect(screen.getByRole('link', { name: /Entry 1/ })).toHaveAttribute('href', '/timeline/entry-1');
    expect(screen.getByRole('link', { name: /Entry 2/ })).toHaveAttribute('href', '/timeline/entry-2');
  });
});
