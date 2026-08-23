import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteEntryDialog } from '@/components/journal/DeleteEntryDialog';

vi.mock('@/actions/entries', () => ({
  deleteEntry: vi.fn(),
}));

describe('DeleteEntryDialog', () => {
  it('moves focus into the dialog, traps Tab, locks scroll, and restores focus on Escape', () => {
    render(<DeleteEntryDialog entryId="entry-1" />);
    const trigger = screen.getAllByRole('button', { name: 'Delete' })[0];

    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const dialog = screen.getByRole('dialog');
    const confirm = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(cancel).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /Close confirm deletion/i })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });
});
