import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AeroLogo } from '@/components/aero/AeroLogo';

describe('AeroLogo', () => {
  it('renders the approved local logo with an accessible name', () => {
    render(<AeroLogo />);

    const image = screen.getByRole('img', { name: 'Aero Diary logo' });
    expect(image).toHaveClass('aero-logo-image');
    expect(image).toHaveAttribute('alt', 'Aero Diary logo');
    expect(image).toHaveAttribute('src', expect.stringContaining('aero-diary-logo.png'));
    expect(image).toHaveAttribute('width', '1254');
    expect(image).toHaveAttribute('height', '1254');
  });
});
