import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AeroDock } from '@/components/aero/AeroDock';
import {
  AeroDockVisibilityProvider,
  useAeroDockVisibility,
} from '@/components/aero/AeroDockVisibility';

vi.mock('next/navigation', () => ({
  usePathname: () => '/timeline',
}));
afterEach(() => cleanup());

function DockReasonControls() {
  const { setHidden } = useAeroDockVisibility();

  return (
    <div>
      <button type="button" onClick={() => setHidden('near-save', true)}>Hide near save</button>
      <button type="button" onClick={() => setHidden('near-save', false)}>Show near save</button>
      <button type="button" onClick={() => setHidden('photo-viewer', true)}>Open photo viewer</button>
      <button type="button" onClick={() => setHidden('photo-viewer', false)}>Close photo viewer</button>
    </div>
  );
}

describe('AeroDockVisibilityProvider', () => {
  it('keeps the dock hidden and inaccessible while any hide reason is active', () => {
    render(
      <AeroDockVisibilityProvider hideDockNearSave>
        <AeroDock />
        <DockReasonControls />
      </AeroDockVisibilityProvider>,
    );

    const dock = screen.getByRole('navigation');
    expect(dock).not.toHaveAttribute('aria-hidden');
    expect(dock).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Hide near save' }));
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(dock).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Open photo viewer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show near save' }));
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(dock).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Close photo viewer' }));
    expect(dock).not.toHaveAttribute('aria-hidden');
    expect(dock).not.toHaveAttribute('inert');
  });

  it('does not accept the save-area reason when it is not enabled', () => {
    render(
      <AeroDockVisibilityProvider>
        <AeroDock />
        <DockReasonControls />
      </AeroDockVisibilityProvider>,
    );

    const dock = screen.getByRole('navigation');
    fireEvent.click(screen.getByRole('button', { name: 'Hide near save' }));

    expect(dock).not.toHaveAttribute('aria-hidden');
    expect(dock).not.toHaveAttribute('inert');
  });
});
