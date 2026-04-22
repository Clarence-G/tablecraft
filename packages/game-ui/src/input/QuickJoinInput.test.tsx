import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickJoinInput } from './QuickJoinInput';

describe('QuickJoinInput', () => {
  it('uppercases typed input', () => {
    render(<QuickJoinInput onSubmit={() => {}} />);
    const input = screen.getByTestId('quickjoin-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc12' } });
    expect(input.value).toBe('ABC12');
  });

  it('submits on Enter', () => {
    const onSubmit = vi.fn();
    render(<QuickJoinInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('quickjoin-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('ABC12');
  });

  it('submits when the button is clicked', () => {
    const onSubmit = vi.fn();
    render(<QuickJoinInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('quickjoin-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('quickjoin-submit'));
    expect(onSubmit).toHaveBeenCalledWith('ABC');
  });

  it('does not submit when empty', () => {
    const onSubmit = vi.fn();
    render(<QuickJoinInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('quickjoin-input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
