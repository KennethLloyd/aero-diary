import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AeroAiComposer } from './AeroAiComposer';

const props = {
  draft: 'A thought',
  onChange: vi.fn(),
  onSubmit: vi.fn((event) => event.preventDefault()),
  onStop: vi.fn(),
  onFocusChange: vi.fn(),
  sending: false,
  disabled: false,
};
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat composer', () => {
  it('grows with a draft and only scrolls after the height cap, then shrinks after send', () => {
    let contentHeight = 78;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    const { rerender } = render(<AeroAiComposer {...props} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveStyle({ height: '78px', overflowY: 'hidden' });
    contentHeight = 260;
    rerender(<AeroAiComposer {...props} draft={'Long draft\n'.repeat(20)} />);
    expect(input).toHaveStyle({ height: '184px', overflowY: 'auto' });
    contentHeight = 52;
    rerender(<AeroAiComposer {...props} draft="" />);
    expect(input).toHaveStyle({ height: '52px', overflowY: 'hidden' });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('sends on desktop Enter but preserves newlines on mobile and while composing text', () => {
    const media = vi.fn(() => ({ matches: false }));
    vi.stubGlobal('matchMedia', media);
    render(<AeroAiComposer {...props} />);
    const input = screen.getByRole('textbox');
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(requestSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(requestSubmit).toHaveBeenCalledTimes(1);
    media.mockReturnValue({ matches: true });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });
});
