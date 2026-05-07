import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscBoard } from './DiscBoard';

const ROWS = 6;
const COLS = 7;
const EMPTY_BOARD = Array(ROWS * COLS).fill(0);

function makeBoard(fills: { row: number; col: number; player: 1 | 2 }[]): number[] {
  const board = [...EMPTY_BOARD];
  for (const { row, col, player } of fills) {
    board[row * COLS + col] = player;
  }
  return board;
}

function renderBoard(
  board: number[],
  canPlay: boolean,
  onColumnClick = vi.fn(),
) {
  return render(
    <DiscBoard
      rows={ROWS}
      cols={COLS}
      board={board}
      myPlayerIndex={0}
      canPlay={canPlay}
      onColumnClick={onColumnClick}
    />,
  );
}

describe('DiscBoard click-target logic', () => {
  describe('empty board — canPlay=true', () => {
    it('renders 42 clickable buttons (all cells)', () => {
      const { getAllByRole } = renderBoard(EMPTY_BOARD, true);
      expect(getAllByRole('button')).toHaveLength(ROWS * COLS);
    });

    it('clicking row 0 of col 3 fires onColumnClick(3)', () => {
      const onClick = vi.fn();
      const { getAllByRole } = renderBoard(EMPTY_BOARD, true, onClick);
      const buttons = getAllByRole('button');
      // Row 0, col 3 → index 3
      fireEvent.click(buttons[3]);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(3);
    });

    it('clicking row 5 of col 3 also fires onColumnClick(3)', () => {
      const onClick = vi.fn();
      const { getAllByRole } = renderBoard(EMPTY_BOARD, true, onClick);
      const buttons = getAllByRole('button');
      // Row 5, col 3 → index 5*7+3 = 38
      fireEvent.click(buttons[38]);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(3);
    });
  });

  describe('partial board — bottom cells filled', () => {
    // Col 3: rows 4 and 5 filled (player 1), rows 0-3 empty.
    const partialBoard = makeBoard([
      { row: 5, col: 3, player: 1 },
      { row: 4, col: 3, player: 2 },
    ]);

    it('filled cells are not buttons', () => {
      const { container } = renderBoard(partialBoard, true);
      const buttons = container.querySelectorAll('button');
      // 42 total cells, 2 filled → 40 buttons
      expect(buttons.length).toBe(40);
    });

    it('clicking the top empty cell of col 3 fires onColumnClick(3)', () => {
      const onClick = vi.fn();
      const { getAllByRole } = renderBoard(partialBoard, true, onClick);
      const buttons = getAllByRole('button');
      // Row 0, col 3 → button index: row 0 has cols 0-6, but col 3 empty, so it's the 4th button
      // in row 0 (cols 0,1,2,3,4,5,6 all buttons at row 0). Index = 3 (0-based within row 0).
      // Total buttons in row 0 = 7. Row 1 = 7. Row 2 = 7. Row 3 = 7.
      // Row 4: col 3 is filled, so 6 buttons. Row 5: col 3 filled, so 6 buttons.
      // Buttons in order: row 0 cols 0-6 (7), row 1 cols 0-6 (7), row 2 *skip col3 filled? No
      // actually row 4 and row 5 have col 3 filled.
      // So order: row0c0, row0c1, row0c2, row0c3, row0c4, row0c5, row0c6,
      //           row1c0..row1c6 (7), row2c0..row2c6 (7), row3c0..row3c6 (7),
      //           row4c0,row4c1,row4c2,[skip c3],row4c4,row4c5,row4c6 (6),
      //           row5c0,row5c1,row5c2,[skip c3],row5c4,row5c5,row5c6 (6)
      // Button at row0 col3 = index 3
      fireEvent.click(buttons[3]);
      expect(onClick).toHaveBeenCalledWith(3);
    });

    it('clicking row 3 (lowest empty cell) of col 3 fires onColumnClick(3)', () => {
      const onClick = vi.fn();
      const { getAllByRole } = renderBoard(partialBoard, true, onClick);
      const buttons = getAllByRole('button');
      // Rows 0-3 all have 7 buttons each = 28. Row 3 col 3 sits at 3*7+3 = 24.
      // (Original 28+3=31 was wrong: that offset is rows 0-3 FULL count, then
      // index 3 within row 4 skips col 3 — landing on col 4 instead.)
      fireEvent.click(buttons[24]);
      expect(onClick).toHaveBeenCalledWith(3);
    });
  });

  describe('full column', () => {
    // Col 0: all 6 rows filled. No buttons in col 0 at all.
    const fullColBoard = makeBoard([
      { row: 0, col: 0, player: 1 },
      { row: 1, col: 0, player: 2 },
      { row: 2, col: 0, player: 1 },
      { row: 3, col: 0, player: 2 },
      { row: 4, col: 0, player: 1 },
      { row: 5, col: 0, player: 2 },
    ]);

    it('full column has no clickable buttons in that column', () => {
      const { container } = renderBoard(fullColBoard, true);
      const buttons = container.querySelectorAll('button');
      // 42 cells, 6 filled in col 0 → 36 buttons
      expect(buttons.length).toBe(36);
    });
  });

  describe('canPlay=false', () => {
    it('renders no buttons when canPlay is false', () => {
      const { container } = renderBoard(EMPTY_BOARD, false);
      expect(container.querySelectorAll('button').length).toBe(0);
    });
  });

  describe('keyboard accessibility', () => {
    it('lowest empty row per column has tabIndex=0', () => {
      // Empty board: ghost row (lowest empty) = row 5 for every column.
      const { container } = renderBoard(EMPTY_BOARD, true);
      const focusableButtons = Array.from(container.querySelectorAll('button[tabindex="0"]'));
      // One focus target per column = 7
      expect(focusableButtons.length).toBe(COLS);
    });

    it('non-focus empty cells have tabIndex=-1', () => {
      const { container } = renderBoard(EMPTY_BOARD, true);
      const hiddenButtons = Array.from(container.querySelectorAll('button[tabindex="-1"]'));
      // 42 total - 7 focus targets = 35
      expect(hiddenButtons.length).toBe(ROWS * COLS - COLS);
    });
  });
});
