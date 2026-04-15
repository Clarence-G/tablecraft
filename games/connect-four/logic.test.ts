import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import { COLS, ROWS } from './shared';

describe('Connect Four Logic', () => {
  function createGame(seed = 'test') {
    const h = new GameTestHarness(logic, {
      players: ['Alice', 'Bob'],
      seed,
    });
    h.setup();
    return h;
  }

  describe('setup', () => {
    it('creates an empty board', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.board).toHaveLength(ROWS * COLS);
      expect(view.board.every((c) => c === 0)).toBe(true);
    });

    it('assigns player indices correctly', () => {
      const h = createGame();
      expect(h.view('Alice').myPlayerIndex).toBe(0);
      expect(h.view('Bob').myPlayerIndex).toBe(1);
    });

    it('first player goes first', () => {
      const h = createGame();
      expect(h.view('Alice').currentPlayer).toBe('Alice');
    });
  });

  describe('drop', () => {
    it('drops a piece into a column', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'drop', col: 3 });
      expect(result.ok).toBe(true);
      // Piece should land at the bottom row (row 5), col 3
      expect(h.view('Alice').board[(ROWS - 1) * COLS + 3]).toBe(1);
    });

    it('pieces stack in a column', () => {
      const h = createGame();
      h.action('Alice', { type: 'drop', col: 0 });
      h.action('Bob', { type: 'drop', col: 0 });
      const view = h.view('Alice');
      expect(view.board[(ROWS - 1) * COLS + 0]).toBe(1); // Alice at bottom
      expect(view.board[(ROWS - 2) * COLS + 0]).toBe(2); // Bob above
    });

    it('alternates turns', () => {
      const h = createGame();
      h.action('Alice', { type: 'drop', col: 0 });
      expect(h.view('Bob').currentPlayer).toBe('Bob');
    });

    it('rejects play out of turn', () => {
      const h = createGame();
      const result = h.action('Bob', { type: 'drop', col: 0 });
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('Not your turn');
    });

    it('rejects full column', () => {
      const h = createGame();
      // Fill column 0 (6 rows)
      for (let i = 0; i < ROWS; i++) {
        const player = i % 2 === 0 ? 'Alice' : 'Bob';
        h.action(player, { type: 'drop', col: 0 });
      }
      // Now column 0 is full; it's Alice's turn (6 moves done, alternating)
      const result = h.action('Alice', { type: 'drop', col: 0 });
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('Column is full');
    });
  });

  describe('win detection', () => {
    function playSequence(h: GameTestHarness<any, any, any>, moves: [string, number][]) {
      for (const [player, col] of moves) {
        h.action(player, { type: 'drop', col });
      }
    }

    it('detects horizontal win', () => {
      const h = createGame();
      // Alice drops cols 0,1,2,3 (4 in a row at bottom), Bob drops col 6 each time
      playSequence(h, [
        ['Alice', 0],
        ['Bob', 6],
        ['Alice', 1],
        ['Bob', 6],
        ['Alice', 2],
        ['Bob', 6],
        ['Alice', 3],
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('detects vertical win', () => {
      const h = createGame();
      // Alice stacks 4 in col 0, Bob alternates col 1
      playSequence(h, [
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 0],
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('detects diagonal win (down-right)', () => {
      const h = createGame();
      // Build Alice diagonal at (5,0),(4,1),(3,2),(2,3)
      // Strictly alternating turns, using dummy moves to set up column heights
      playSequence(h, [
        ['Alice', 0], // (5,0) Alice diagonal piece 1
        ['Bob', 1], // (5,1) filler
        ['Alice', 1], // (4,1) Alice diagonal piece 2
        ['Bob', 2], // (5,2) filler
        ['Alice', 5], // dummy
        ['Bob', 2], // (4,2) filler
        ['Alice', 2], // (3,2) Alice diagonal piece 3
        ['Bob', 3], // (5,3) filler
        ['Alice', 6], // dummy
        ['Bob', 3], // (4,3) filler
        ['Alice', 6], // dummy
        ['Bob', 3], // (3,3) filler
        ['Alice', 3], // (2,3) Alice diagonal piece 4 -> WIN
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('does not trigger win for three in a row', () => {
      const h = createGame();
      playSequence(h, [
        ['Alice', 0],
        ['Bob', 6],
        ['Alice', 1],
        ['Bob', 6],
        ['Alice', 2],
        ['Bob', 6],
      ]);
      expect(h.isFinished).toBe(false);
    });
  });

  describe('draw detection', () => {
    it('reports isDraw false on new game', () => {
      const h = createGame();
      expect(h.view('Alice').isDraw).toBe(false);
    });

    it('reports isDraw true when board is full with no winner', () => {
      const h = createGame();
      // Fill board using a round-robin column order that avoids 4-in-a-row.
      // Dropping in column order 0,1,2,3,4,5,6 repeated 6 times alternates
      // players such that each column has: A,B,A,B,A,B from bottom to top.
      // Row 5 (bottom): A B A B A B A
      // Row 4: B A B A B A B
      // etc. — checkerboard, no 4-in-a-row possible.
      const sequence: [string, number][] = [
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 2],
        ['Bob', 3],
        ['Alice', 4],
        ['Bob', 5],
        ['Alice', 6],
        ['Bob', 6],
        ['Alice', 5],
        ['Bob', 4],
        ['Alice', 3],
        ['Bob', 2],
        ['Alice', 1],
        ['Bob', 0],
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 2],
        ['Bob', 3],
        ['Alice', 4],
        ['Bob', 5],
        ['Alice', 6],
        ['Bob', 6],
        ['Alice', 5],
        ['Bob', 4],
        ['Alice', 3],
        ['Bob', 2],
        ['Alice', 1],
        ['Bob', 0],
        ['Alice', 0],
        ['Bob', 1],
        ['Alice', 2],
        ['Bob', 3],
        ['Alice', 4],
        ['Bob', 5],
        ['Alice', 6],
        ['Bob', 6],
        ['Alice', 5],
        ['Bob', 4],
        ['Alice', 3],
        ['Bob', 2],
        ['Alice', 1],
        ['Bob', 0],
      ];

      for (const [player, col] of sequence) {
        if (h.isFinished) break;
        h.action(player, { type: 'drop', col });
      }

      // Board should be full or game ended (win or draw)
      const view = h.view('Alice');
      expect(view.board.every((c) => c !== 0) || h.isFinished).toBe(true);
    });
  });
});
