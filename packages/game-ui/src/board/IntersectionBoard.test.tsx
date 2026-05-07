import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntersectionBoard } from './IntersectionBoard';

const SIZE = 5;
const emptyStones = Array.from({ length: SIZE }, () => Array<null>(SIZE).fill(null));

function mockMatchMedia(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: isMobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      // framer-motion's reduced-motion detector still calls the
      // deprecated addListener / removeListener API. Without these
      // stubs, mounting any <motion.div> throws
      // "motionMediaQuery.addListener is not a function".
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
}

function renderBoard(
  overrides: Partial<Parameters<typeof IntersectionBoard>[0]> = {},
  onPlace = vi.fn(),
) {
  return render(
    <IntersectionBoard
      size={SIZE}
      stones={emptyStones}
      canPlace={() => true}
      previewStone="black"
      onPlace={onPlace}
      {...overrides}
    />,
  );
}

// cell at (r, c) has aria-label "{r+1},{c+1}"
function getCell(container: HTMLElement, r: number, c: number) {
  return container.querySelector(`[data-row="${r}"][data-col="${c}"]`) as HTMLElement;
}

describe('IntersectionBoard — desktop direct placement', () => {
  beforeEach(() => mockMatchMedia(false));

  it('single click calls onPlace immediately with correct coords', () => {
    const onPlace = vi.fn();
    const { container } = renderBoard({}, onPlace);
    fireEvent.click(getCell(container, 0, 0));
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace).toHaveBeenCalledWith(0, 0);
  });

  it('no ConfirmChip appears on desktop', () => {
    const { container, queryByTestId } = renderBoard();
    fireEvent.click(getCell(container, 0, 0));
    expect(queryByTestId('confirm-chip')).toBeNull();
  });
});

describe('IntersectionBoard — mobile tap-to-confirm', () => {
  beforeEach(() => mockMatchMedia(true));

  it('first tap arms the cell: onPlace not called, ConfirmChip visible with correct label', () => {
    const onPlace = vi.fn();
    const { container, queryByTestId, getByText } = renderBoard({}, onPlace);
    fireEvent.click(getCell(container, 0, 0));
    expect(onPlace).not.toHaveBeenCalled();
    // coord: col=0 → 'A', row = size - 0 = 5 → "A5"
    expect(getByText('放在 A5？')).toBeTruthy();
    expect(queryByTestId('confirm-chip')).not.toBeNull();
  });

  it('first tap shows armed preview stone', () => {
    const { container, queryByTestId } = renderBoard();
    fireEvent.click(getCell(container, 0, 0));
    expect(queryByTestId('armed-preview')).not.toBeNull();
  });

  it('second tap on same armed cell commits: onPlace called once', () => {
    const onPlace = vi.fn();
    const { container } = renderBoard({}, onPlace);
    fireEvent.click(getCell(container, 0, 0));
    fireEvent.click(getCell(container, 0, 0));
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace).toHaveBeenCalledWith(0, 0);
  });

  it('tapping confirm button (checkmark) commits the move', () => {
    const onPlace = vi.fn();
    const { container, getByLabelText } = renderBoard({}, onPlace);
    fireEvent.click(getCell(container, 1, 2));
    fireEvent.click(getByLabelText('确认'));
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace).toHaveBeenCalledWith(1, 2);
  });

  it('tapping cancel button (X) cancels: onPlace not called, chip removed', () => {
    const onPlace = vi.fn();
    const { container, getByLabelText, queryByTestId } = renderBoard({}, onPlace);
    fireEvent.click(getCell(container, 0, 0));
    fireEvent.click(getByLabelText('取消'));
    expect(onPlace).not.toHaveBeenCalled();
    expect(queryByTestId('confirm-chip')).toBeNull();
  });

  it('tapping a different cell re-arms to that cell without calling onPlace', () => {
    const onPlace = vi.fn();
    const { container, getByText } = renderBoard({}, onPlace);
    // arm (0,0)
    fireEvent.click(getCell(container, 0, 0));
    expect(getByText('放在 A5？')).toBeTruthy();
    // tap different cell (1,1) — col=1:'B', row=5-1=4 → "B4"
    fireEvent.click(getCell(container, 1, 1));
    expect(onPlace).not.toHaveBeenCalled();
    expect(getByText('放在 B4？')).toBeTruthy();
  });

  it('auto-cancels after 4 seconds idle', () => {
    vi.useFakeTimers();
    const { container, queryByTestId } = renderBoard();
    fireEvent.click(getCell(container, 0, 0));
    expect(queryByTestId('confirm-chip')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(queryByTestId('confirm-chip')).toBeNull();
    vi.useRealTimers();
  });

  it('disabled prop clears armed state and removes ConfirmChip', () => {
    const { container, queryByTestId, rerender } = renderBoard({ disabled: false });
    fireEvent.click(getCell(container, 0, 0));
    expect(queryByTestId('confirm-chip')).not.toBeNull();
    rerender(
      <IntersectionBoard
        size={SIZE}
        stones={emptyStones}
        canPlace={() => true}
        previewStone="black"
        onPlace={vi.fn()}
        disabled={true}
      />,
    );
    expect(queryByTestId('confirm-chip')).toBeNull();
  });
});
