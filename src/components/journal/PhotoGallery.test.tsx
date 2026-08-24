import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoGallery } from '@/components/journal/PhotoGallery';

vi.mock('@/actions/entries', () => ({
  deletePhoto: vi.fn(),
}));

afterEach(cleanup);

const photos = [
  { id: 'photo-1' },
  { id: 'photo-2' },
  { id: 'photo-3' },
];

describe('PhotoGallery', () => {
  it('renders every photo as a compact thumbnail without delete controls by default', () => {
    render(<PhotoGallery photos={photos} />);

    expect(screen.getByRole('list', { name: 'Entry photos' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View photo/ })).toHaveLength(3);
    expect(screen.queryAllByRole('button', { name: 'Remove photo' })).toHaveLength(0);
    expect(screen.queryByText('Photo 1')).not.toBeInTheDocument();
    expect(screen.queryByText('No photos attached yet.')).not.toBeInTheDocument();
  });

  it('renders delete controls when editable is true', () => {
    render(<PhotoGallery photos={photos} editable />);

    expect(screen.getAllByRole('button', { name: /View photo/ })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Remove photo' })).toHaveLength(3);
  });

  it('opens the viewer, navigates with the keyboard, and closes with Escape', () => {
    render(<PhotoGallery photos={photos} />);

    const viewPhotoTwoButtons = screen.getAllByRole('button', { name: 'View photo 2' });
    fireEvent.click(viewPhotoTwoButtons[viewPhotoTwoButtons.length - 1]);
    expect(screen.getByRole('dialog')).toHaveTextContent('Photo 2 of 3');
    expect(screen.getByRole('button', { name: 'Close photo viewer' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Photo 3 of 3');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Photo 2 of 3');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no photos', () => {
    const { container } = render(<PhotoGallery photos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('replaces a missing image with a deliberate fallback and retry control', () => {
    render(<PhotoGallery photos={[{ id: 'missing-photo' }]} />);
    const viewButtons = screen.getAllByRole('button', { name: 'View photo 1' });
    fireEvent.click(viewButtons.at(-1)!);
    const images = document.querySelectorAll('img');
    fireEvent.error(images.item(images.length - 1)!);

    expect(screen.getAllByRole('status').find((status) => status.textContent?.includes('Photo unavailable'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
