import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { GameHeaderProvider, useGameHeaderStatus, useHeaderStatus } from './GameHeaderContext';

function Probe({ player, phase }: { player?: string; phase?: string }) {
  useGameHeaderStatus(player, phase);
  return null;
}

function Display() {
  const { currentPlayerId, phase } = useHeaderStatus();
  return (
    <span data-testid="display">
      {currentPlayerId ?? 'none'}|{phase ?? 'none'}
    </span>
  );
}

describe('GameHeaderContext', () => {
  it('propagates status from hook to consumers without looping', () => {
    const { getByTestId } = render(
      <GameHeaderProvider>
        <Probe player="alice" phase="round-1" />
        <Display />
      </GameHeaderProvider>,
    );
    expect(getByTestId('display').textContent).toBe('alice|round-1');
  });

  it('updates when the pushed status changes', () => {
    function TestApp({ turn }: { turn: string }) {
      return (
        <GameHeaderProvider>
          <Probe player={turn} />
          <Display />
        </GameHeaderProvider>
      );
    }
    const { getByTestId, rerender } = render(<TestApp turn="alice" />);
    expect(getByTestId('display').textContent).toBe('alice|none');
    rerender(<TestApp turn="bob" />);
    expect(getByTestId('display').textContent).toBe('bob|none');
  });

  it('no-ops when called outside a provider', () => {
    // Should not throw and should not cause a re-render loop.
    let renderCount = 0;
    function OutsideProbe() {
      renderCount++;
      useGameHeaderStatus('x');
      useEffect(() => {});
      return null;
    }
    render(<OutsideProbe />);
    act(() => {});
    expect(renderCount).toBeLessThan(5);
  });
});
