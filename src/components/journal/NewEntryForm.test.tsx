import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { parseJournalDate } from '@/lib/journal/dates';
import { NewEntryForm, type EditableEntry } from '@/components/journal/NewEntryForm';
import { deletePhoto } from '@/actions/entries';
import { polishEntry } from '@/actions/polish';

vi.mock('@/actions/entries', () => ({
  createEntry: vi.fn(),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn(),
}));
vi.mock('@/actions/polish', () => ({
  polishEntry: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
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

const deletePhotoMock = vi.mocked(deletePhoto);
const polishEntryMock = vi.mocked(polishEntry);

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
  it('shows the updated capacity and supported HEIF helper copy', () => {
    render(<NewEntryForm activities={[]} />);

    expect(screen.getByText('0 of 20 photos')).toBeInTheDocument();
    expect(screen.getByText(
      'Select JPEG, PNG, HEIC, or HEIF photos. Transfers continue while you write.',
    )).toBeInTheDocument();
  });

  it('renders twenty existing photos and hides Add photos at capacity', () => {
    render(<NewEntryForm activities={[]} entry={editableEntry(20)} />);

    expect(screen.getByText('20 of 20 photos')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Attached photo/ })).toHaveLength(20);
    expect(screen.getAllByRole('button', { name: /Remove attached photo/ })).toHaveLength(20);
    expect(screen.queryByRole('button', { name: 'Add photos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add more photos' })).not.toBeInTheDocument();
  });
  it('updates capacity when an existing photo is removed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NewEntryForm activities={[]} entry={editableEntry(19)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove attached photo 1' }));

    await waitFor(() => expect(screen.getByText('18 of 20 photos')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add more photos' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('keeps existing-photo removal pending until the direct server action resolves', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const removal = Promise.withResolvers<undefined>();
    deletePhotoMock.mockReturnValue(removal.promise);
    render(<NewEntryForm activities={[]} entry={editableEntry(1)} />);

    const removeButton = screen.getByRole('button', { name: 'Remove attached photo 1' });
    fireEvent.click(removeButton);

    expect(deletePhotoMock).toHaveBeenCalledWith('photo-1', undefined, expect.any(FormData));
    expect(removeButton).toBeDisabled();
    expect(screen.getByText('1 of 20 photos')).toBeVisible();

    removal.resolve(undefined);

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Attached photo 1' })).not.toBeInTheDocument());
    expect(screen.getByText('0 of 20 photos')).toBeVisible();
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
    expect(screen.getByText('1 of 20 photos')).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it('keeps Polish writing feedback and applies the direct server action result', async () => {
    const polish = Promise.withResolvers<{ revisedText: string }>();
    polishEntryMock.mockReturnValue(polish.promise);
    render(<NewEntryForm activities={[]} />);

    const note = screen.getByLabelText('Journal Note');
    fireEvent.change(note, { target: { value: 'A draft worth polishing.' } });
    const polishButton = screen.getByRole('button', { name: /Polish writing/ });
    fireEvent.click(polishButton);

    expect(polishEntryMock).toHaveBeenCalledWith(undefined, expect.any(FormData));
    expect(screen.getByRole('button', { name: /Polishing…/ })).toBeDisabled();

    polish.resolve({ revisedText: 'A polished draft worth keeping.' });

    await waitFor(() => expect(screen.getByDisplayValue('A polished draft worth keeping.')).toBeVisible());
    expect(screen.getByRole('button', { name: 'Show original' })).toBeVisible();
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
    await waitFor(() => expect(screen.getByText('1 of 20 photos')).toBeInTheDocument());
    cleanup();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/photo-stages/staged-1',
      { method: 'DELETE', keepalive: true },
    ));
    fetchMock.mockRestore();
  });
});
