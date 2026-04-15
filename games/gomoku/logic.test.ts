import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import { BOARD_SIZE } from './shared';

describe('Gomoku Logic', () => {
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
      expect(view.board).toHaveLength(BOARD_SIZE);
      expect(view.board[0]).toHaveLength(BOARD_SIZE);
      expect(view.board.flat().every((c) => c === null)).toBe(true);
    });

    it('assigns black to first player', () => {
      const h = createGame();
      expect(h.view('Alice').myStone).toBe('black');
      expect(h.view('Bob').myStone).toBe('white');
    });

    it('first player goes first', () => {
      const h = createGame();
      expect(h.view('Alice').currentPlayer).toBe('Alice');
    });
  });

  describe('place', () => {
    it('places a stone on empty cell', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'place', row: 7, col: 7 });
      expect(result.ok).toBe(true);
      expect(h.view('Alice').board[7][7]).toBe('black');
    });

    it('alternates turns', () => {
      const h = createGame();
      h.action('Alice', { type: 'place', row: 0, col: 0 });
      expect(h.view('Bob').currentPlayer).toBe('Bob');
    });

    it('rejects play out of turn', () => {
      const h = createGame();
      const result = h.action('Bob', { type: 'place', row: 0, col: 0 });
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('Not your turn');
    });

    it('rejects occupied cell', () => {
      const h = createGame();
      h.action('Alice', { type: 'place', row: 0, col: 0 });
      h.action('Bob', { type: 'place', row: 1, col: 0 });
      const result = h.action('Alice', { type: 'place', row: 0, col: 0 });
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('Cell already occupied');
    });
  });

  describe('win detection', () => {
    function playSequence(h: GameTestHarness<any, any, any>, moves: [string, number, number][]) {
      for (const [player, row, col] of moves) {
        h.action(player, { type: 'place', row, col });
      }
    }

    it('detects horizontal win', () => {
      const h = createGame();
      // Alice: row 7, cols 0-4 (black wins)
      // Bob: row 8, cols 0-3 (interspersed)
      playSequence(h, [
        ['Alice', 7, 0],
        ['Bob', 8, 0],
        ['Alice', 7, 1],
        ['Bob', 8, 1],
        ['Alice', 7, 2],
        ['Bob', 8, 2],
        ['Alice', 7, 3],
        ['Bob', 8, 3],
        ['Alice', 7, 4],
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('detects vertical win', () => {
      const h = createGame();
      playSequence(h, [
        ['Alice', 0, 7],
        ['Bob', 0, 8],
        ['Alice', 1, 7],
        ['Bob', 1, 8],
        ['Alice', 2, 7],
        ['Bob', 2, 8],
        ['Alice', 3, 7],
        ['Bob', 3, 8],
        ['Alice', 4, 7],
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('detects diagonal win', () => {
      const h = createGame();
      playSequence(h, [
        ['Alice', 0, 0],
        ['Bob', 0, 1],
        ['Alice', 1, 1],
        ['Bob', 0, 2],
        ['Alice', 2, 2],
        ['Bob', 0, 3],
        ['Alice', 3, 3],
        ['Bob', 0, 4],
        ['Alice', 4, 4],
      ]);
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('does not trigger win for four in a row', () => {
      const h = createGame();
      playSequence(h, [
        ['Alice', 7, 0],
        ['Bob', 8, 0],
        ['Alice', 7, 1],
        ['Bob', 8, 1],
        ['Alice', 7, 2],
        ['Bob', 8, 2],
        ['Alice', 7, 3],
        ['Bob', 8, 3],
      ]);
      expect(h.isFinished).toBe(false);
    });
  });
});
