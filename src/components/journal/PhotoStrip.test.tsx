import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoStrip } from '@/components/journal/PhotoStrip';

describe('PhotoStrip', () => {
  it('scrolls horizontally when dragged with a mouse', () => {
    const { getAllByRole } = render(
      <PhotoStrip>
        <div>Photo one</div>
        <div>Photo two</div>
      </PhotoStrip>,
    );
    const [strip] = getAllByRole('region', { name: 'Polaroid photo strip' }).slice(-1);
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: 120, writable: true });

    fireEvent.pointerDown(strip, { button: 0, clientX: 300, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(strip, { clientX: 180, pointerId: 1, pointerType: 'mouse' });

    expect(strip.scrollLeft).toBe(240);
  });

  it('does not hijack pointer presses on interactive photo controls', () => {
    const { getAllByRole, getByRole } = render(
      <PhotoStrip>
        <button type="button">Remove photo</button>
      </PhotoStrip>,
    );
    const [strip] = getAllByRole('region', { name: 'Polaroid photo strip' }).slice(-1);
    const button = getByRole('button', { name: 'Remove photo' });

    fireEvent.pointerDown(button, { button: 0, clientX: 300, pointerId: 1, pointerType: 'mouse' });

    expect(strip).toHaveAttribute('data-dragging', 'false');
  });
});
