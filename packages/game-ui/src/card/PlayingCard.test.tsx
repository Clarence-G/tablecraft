import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PlayingCard } from './PlayingCard';

describe('PlayingCard', () => {
  it('renders as a button when onClick is given', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<PlayingCard corner="A" center="♠" onClick={onClick} />);
    const btn = getByRole('button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a plain div when no onClick', () => {
    const { container } = render(<PlayingCard corner="A" center="♠" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('div')).not.toBeNull();
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <PlayingCard corner="A" center="♠" onClick={onClick} disabled />,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides corner + center content when faceDown', () => {
    const { container } = render(<PlayingCard corner="A" center="♠" faceDown />);
    expect(container.textContent).not.toContain('A');
    expect(container.textContent).not.toContain('♠');
    expect(container.textContent).toContain('?');
  });

  it('applies ring + lift classes when selected', () => {
    const { container } = render(
      <PlayingCard corner="A" center="♠" onClick={() => {}} selected />,
    );
    const btn = container.querySelector('button');
    expect(btn?.className).toMatch(/ring-2/);
    expect(btn?.className).toMatch(/-translate-y-2/);
  });
});
