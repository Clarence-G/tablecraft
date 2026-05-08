import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { RoomOptionsPanel } from './RoomOptionsPanel';

describe('RoomOptionsPanel', () => {
  const baseProps = {
    status: 'waiting' as const,
    isHost: true,
    currentMaxPlayers: 4,
    currentPlayerCount: 2,
    minPlayers: 2,
    maxPlayers: 6,
  };

  it('renders nothing when room is not waiting', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <RoomOptionsPanel {...baseProps} status="playing" onUpdate={onUpdate} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('stepper decrements until the lower bound (max(minPlayers, currentPlayerCount))', () => {
    const onUpdate = vi.fn();
    render(
      <RoomOptionsPanel
        {...baseProps}
        currentMaxPlayers={3}
        currentPlayerCount={3}
        minPlayers={2}
        onUpdate={onUpdate}
      />,
    );
    // currentMaxPlayers === lowerBound (3), so decrement is disabled
    const dec = screen.getByTestId('max-players-decrement') as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
    fireEvent.click(dec);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('stepper increments up to the absolute maxPlayers', () => {
    const onUpdate = vi.fn();
    render(
      <RoomOptionsPanel {...baseProps} currentMaxPlayers={6} maxPlayers={6} onUpdate={onUpdate} />,
    );
    const inc = screen.getByTestId('max-players-increment') as HTMLButtonElement;
    expect(inc.disabled).toBe(true);
    fireEvent.click(inc);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('emits room:updateOptions payload on stepper click within bounds', () => {
    const onUpdate = vi.fn();
    render(<RoomOptionsPanel {...baseProps} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('max-players-increment'));
    expect(onUpdate).toHaveBeenCalledWith({ maxPlayers: 5 });
    fireEvent.click(screen.getByTestId('max-players-decrement'));
    expect(onUpdate).toHaveBeenCalledWith({ maxPlayers: 3 });
  });

  it('non-host renders read-only with disabled stepper and host-only notice', () => {
    const onUpdate = vi.fn();
    render(<RoomOptionsPanel {...baseProps} isHost={false} onUpdate={onUpdate} />);
    const dec = screen.getByTestId('max-players-decrement') as HTMLButtonElement;
    const inc = screen.getByTestId('max-players-increment') as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
    expect(inc.disabled).toBe(true);
    fireEvent.click(dec);
    fireEvent.click(inc);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getAllByTitle(/only the host/i).length).toBeGreaterThan(0);
  });

  it('auto-generates boolean input from ZodObject configSchema', () => {
    const onUpdate = vi.fn();
    const schema = z.object({ fastMode: z.boolean().default(false) });
    render(
      <RoomOptionsPanel
        {...baseProps}
        configSchema={schema}
        currentConfig={{ fastMode: false }}
        onUpdate={onUpdate}
      />,
    );
    const checkbox = screen.getByTestId('config-fastMode') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onUpdate).toHaveBeenCalledWith({ config: { fastMode: true } });
  });

  it('auto-generated config inputs are disabled for non-host', () => {
    const onUpdate = vi.fn();
    const schema = z.object({ fastMode: z.boolean().default(false) });
    render(
      <RoomOptionsPanel
        {...baseProps}
        isHost={false}
        configSchema={schema}
        currentConfig={{ fastMode: false }}
        onUpdate={onUpdate}
      />,
    );
    const checkbox = screen.getByTestId('config-fastMode') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
