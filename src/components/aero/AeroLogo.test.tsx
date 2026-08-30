import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AeroLogo } from '@/components/aero/AeroLogo';

describe('AeroLogo', () => {
  it('renders the supplied app icon with an accessible name', () => {
    render(<AeroLogo />);

    const image = screen.getByRole('img', { name: 'Aero Diary app icon' });
    expect(image).toHaveAttribute('alt', 'Aero Diary app icon');
    expect(image).toHaveAttribute('src', expect.stringContaining('aero-diary-icon.png'));
    expect(image).toHaveAttribute('width', '1254');
    expect(image).toHaveAttribute('height', '1254');
    expect(image).toHaveAttribute('sizes', '(max-width: 639px) 180px, 220px');
  });
});
