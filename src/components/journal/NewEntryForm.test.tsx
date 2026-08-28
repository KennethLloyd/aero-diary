import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { parseJournalDate } from '@/lib/journal/dates';
import { NewEntryForm, type EditableEntry } from '@/components/journal/NewEntryForm';

vi.mock('@/actions/entries', () => ({
  createEntry: vi.fn(),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn(),
}));
afterEach(() => cleanup());
function editableEntry(photoCount: number, activityIds: string[] = []): EditableEntry {
  return {
    id: 'entry-1',
    journalDate: parseJournalDate('2026-08-28'),
    mood: Mood.GOOD,
    note: 'A note worth keeping.',
    activityIds,
    photos: Array.from({ length: photoCount }, (_, index) => ({ id: `photo-${index + 1}` })),
  };
}
function changeFiles(input: HTMLInputElement, files: File[]) {
  const fileList = {
    0: files[0],
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* files;
    },
  };
  Object.defineProperty(input, 'files', { configurable: true, value: fileList });
  fireEvent.change(input);
}

describe('NewEntryForm activity state', () => {
  it('does not show activity controls while creating an entry', () => {
    render(
      <NewEntryForm
        activities={[
          { id: 'gaming', name: 'Gaming', emoji: '🎮' },
          { id: 'dining', name: 'Dining', emoji: '🍽️' },
        ]}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Activities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gaming/ })).not.toBeInTheDocument();
  });

  it('keeps selected activities visible before revealing the remaining options', () => {
    const activities = Array.from({ length: 10 }, (_, index) => ({
      id: `activity-${index + 1}`,
      name: `Activity ${index + 1}`,
      emoji: '✨',
    }));
    render(
      <NewEntryForm
        activities={activities}
        entry={editableEntry(0, ['activity-10'])}
      />,
    );

    expect(screen.getByRole('button', { name: /Activity 10/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /Activity/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: /Show more/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    expect(screen.getAllByRole('button', { name: /Activity/ })).toHaveLength(10);
    expect(screen.getByRole('button', { name: /Show less/ })).toBeInTheDocument();
  });
});

describe('NewEntryForm photo state', () => {
  it('renders existing photos and hides Add photos at capacity', () => {
    render(<NewEntryForm activities={[]} entry={editableEntry(10)} />);

    expect(screen.getByText('10 of 10 photos')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Attached photo/ })).toHaveLength(10);
    expect(screen.getAllByRole('button', { name: /Remove attached photo/ })).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Add photos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add more photos' })).not.toBeInTheDocument();
  });
  it('updates capacity when an existing photo is removed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NewEntryForm activities={[]} entry={editableEntry(9)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove attached photo 1' }));

    await waitFor(() => expect(screen.getByText('8 of 10 photos')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add more photos' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('shows a failed staged upload with a retry path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'staged-1', status: 'ready' }), { status: 200 }));
    render(<NewEntryForm activities={[]} />);

    const input = screen.getByLabelText('Select photos');
    changeFiles(input as HTMLInputElement, [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })]);

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument());
    expect(screen.getByText('1 of 10 photos')).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it('cleans a stage by id when removal races the upload response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const uploadResponse = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(uploadResponse.promise);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    render(<NewEntryForm activities={[]} />);

    changeFiles(
      screen.getByLabelText('Select photos') as HTMLInputElement,
      [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo.jpg' }));
    uploadResponse.resolve(new Response(JSON.stringify({ id: 'staged-1', status: 'ready' }), { status: 200 }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/photo-stages/staged-1',
      { method: 'DELETE', keepalive: true },
    ));
    fetchMock.mockRestore();
  });

  it('removes a server-owned stage when an upload response has no id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    render(<NewEntryForm activities={[]} />);

    changeFiles(
      screen.getByLabelText('Select photos') as HTMLInputElement,
      [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
    );
    await screen.findByText('Upload failed');

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo.jpg' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/api\/photo-stages\?draftKey=.+&clientKey=.+$/),
      { method: 'DELETE', keepalive: true },
    ));
    fetchMock.mockRestore();
  });

  it('cleans ready server stages when leaving the form', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'staged-1', status: 'ready' }), { status: 200 }));
    render(<NewEntryForm activities={[]} />);

    changeFiles(
      screen.getByLabelText('Select photos') as HTMLInputElement,
      [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
    );
    await waitFor(() => expect(screen.getByText('1 of 10 photos')).toBeInTheDocument());
    cleanup();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/photo-stages/staged-1',
      { method: 'DELETE', keepalive: true },
    ));
    fetchMock.mockRestore();
  });
});
