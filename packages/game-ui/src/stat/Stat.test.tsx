import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stat } from './Stat';

describe('Stat', () => {
  it('renders label and value', () => {
    render(<Stat label="Points" value={42} />);
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('uses larger typography when big is set', () => {
    render(<Stat label="Points" value={42} big />);
    const valueEl = screen.getByText('42');
    expect(valueEl.className).toContain('text-2xl');
  });

  it('uses default typography when big is not set', () => {
    render(<Stat label="Points" value={42} />);
    const valueEl = screen.getByText('42');
    expect(valueEl.className).not.toContain('text-2xl');
    expect(valueEl.className).toContain('text-base');
  });
});
