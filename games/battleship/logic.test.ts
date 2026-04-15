import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView, ShipPlacement } from './shared';
import { CLASSIC_SHIPS, GRID_SIZE } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(seed = 'test') {
  const h = new GameTestHarness(logic, { players: ['Alice', 'Bob'], seed });
  h.setup();
  return h;
}

// Build a simple valid placement: all ships horizontal along rows 0..4
function buildPlacements(): ShipPlacement[] {
  return CLASSIC_SHIPS.map((_, i) => ({
    shipIndex: i,
    row: i,
    col: 0,
    rotation: 0,
  }));
}

function placeBoth(h: Harness) {
  const p = buildPlacements();
  h.action('Alice', { type: 'place_ships', placements: p });
  h.action('Bob', { type: 'place_ships', placements: p });
}

describe('Battleship Logic', () => {
  describe('setup', () => {
    it('starts in placement phase', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.phase).toBe('placement');
      expect(view.myPlaced).toBe(false);
      expect(view.opponentPlaced).toBe(false);
    });

    it('my grid is all water initially', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.myGrid.every((c) => c === 0)).toBe(true);
    });
  });

  describe('place_ships', () => {
    it('accepts valid placements', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'place_ships', placements: buildPlacements() });
      expect(result.ok).toBe(true);
      const view = h.view('Alice');
      expect(view.myPlaced).toBe(true);
    });

    it('rejects duplicate ship index', () => {
      const h = createGame();
      const placements: ShipPlacement[] = buildPlacements();
      placements[1] = { ...placements[0] }; // duplicate ship 0
      const result = h.action('Alice', { type: 'place_ships', placements });
      expect(result.ok).toBe(false);
    });

    it('rejects out-of-bounds placement', () => {
      const h = createGame();
      const placements: ShipPlacement[] = buildPlacements();
      // Put carrier (5 cells) at col 8 — would go out of bounds
      placements[0] = { shipIndex: 0, row: 0, col: 8, rotation: 0 };
      const result = h.action('Alice', { type: 'place_ships', placements });
      expect(result.ok).toBe(false);
    });

    it('rejects overlapping ships', () => {
      const h = createGame();
      const placements: ShipPlacement[] = buildPlacements();
      // Put both carrier and battleship on same row 0
      placements[1] = { shipIndex: 1, row: 0, col: 0, rotation: 0 };
      const result = h.action('Alice', { type: 'place_ships', placements });
      expect(result.ok).toBe(false);
    });

    it('rejects placing ships twice', () => {
      const h = createGame();
      const p = buildPlacements();
      h.action('Alice', { type: 'place_ships', placements: p });
      const result = h.action('Alice', { type: 'place_ships', placements: p });
      expect(result.ok).toBe(false);
    });

    it('transitions to playing when both players placed', () => {
      const h = createGame();
      const p = buildPlacements();
      h.action('Alice', { type: 'place_ships', placements: p });
      expect(h.view('Alice').phase).toBe('placement');
      h.action('Bob', { type: 'place_ships', placements: p });
      expect(h.view('Alice').phase).toBe('playing');
    });

    it('stays in placement until both placed', () => {
      const h = createGame();
      h.action('Alice', { type: 'place_ships', placements: buildPlacements() });
      expect(h.view('Alice').phase).toBe('placement');
      expect(h.view('Alice').opponentPlaced).toBe(false);
    });
  });

  describe('fire action', () => {
    it('rejects fire during placement phase', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'fire', row: 0, col: 0 });
      expect(result.ok).toBe(false);
    });

    it('rejects fire from wrong player', () => {
      const h = createGame();
      placeBoth(h);
      // currentPlayer is Alice (index 0), Bob should be rejected
      const result = h.action('Bob', { type: 'fire', row: 5, col: 5 });
      expect(result.ok).toBe(false);
    });

    it('records a miss correctly', () => {
      const h = createGame();
      placeBoth(h);
      // Alice fires at row 9, col 9 — no ship there (ships are on rows 0-4 col 0+)
      const result = h.action('Alice', { type: 'fire', row: 9, col: 9 });
      expect(result.ok).toBe(true);
      const view = h.view('Alice');
      expect(view.myShots[9 * GRID_SIZE + 9]).toBe(1);
    });

    it('records a hit correctly', () => {
      const h = createGame();
      placeBoth(h);
      // Bob's carrier is at row 0, cols 0-4 (shipIndex 0)
      const result = h.action('Alice', { type: 'fire', row: 0, col: 0 });
      expect(result.ok).toBe(true);
      const view = h.view('Alice');
      expect(view.myShots[0]).toBe(2);
    });

    it('rejects firing at already-fired cell', () => {
      const h = createGame();
      placeBoth(h);
      h.action('Alice', { type: 'fire', row: 9, col: 9 });
      h.action('Bob', { type: 'fire', row: 9, col: 9 });
      h.action('Alice', { type: 'fire', row: 9, col: 8 });
      h.action('Bob', { type: 'fire', row: 9, col: 8 });
      // Now Alice fires at 9,9 again
      h.action('Alice', { type: 'fire', row: 9, col: 7 });
      h.action('Bob', { type: 'fire', row: 9, col: 7 });
      const result = h.action('Alice', { type: 'fire', row: 9, col: 9 });
      expect(result.ok).toBe(false);
    });

    it('alternates turns', () => {
      const h = createGame();
      placeBoth(h);
      h.action('Alice', { type: 'fire', row: 9, col: 9 });
      // Now it should be Bob's turn
      const view = h.view('Bob');
      expect(view.currentPlayer).toBe('Bob');
    });
  });

  describe('win detection', () => {
    it('detects win when all ships sunk', () => {
      const h = createGame();
      placeBoth(h);
      // Bob's ships (placements identical to Alice's): rows 0-4, starting col 0
      // Ship sizes: 5, 4, 3, 3, 2 — total 17 cells
      // Alice fires all Bob's cells, Bob fires randomly
      const shipCells: [number, number][] = [];
      for (const [shipIdx, ship] of CLASSIC_SHIPS.entries()) {
        const size = ship.offsets.length;
        for (let c = 0; c < size; c++) {
          shipCells.push([shipIdx, c]);
        }
      }

      // Bob fires at empty cells — use rows 5-9 which have no ships
      // 17 distinct cells: rows 5,6,7,8,9 * cols 0..2 = 15, plus row 5 col 3 and col 4 = 17
      const bobTargets: [number, number][] = [];
      for (let r = 5; r <= 9 && bobTargets.length < 17; r++) {
        for (let c = 0; c <= 9 && bobTargets.length < 17; c++) {
          bobTargets.push([r, c]);
        }
      }
      let bobFires = 0;
      for (const [row, col] of shipCells) {
        h.action('Alice', { type: 'fire', row, col });
        if (!h.isFinished) {
          const target = bobTargets[bobFires];
          if (target) {
            h.action('Bob', { type: 'fire', row: target[0], col: target[1] });
          }
          bobFires++;
        }
      }

      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
      expect(h.rankings?.[1]).toBe('Bob');
    });
  });

  describe('view privacy', () => {
    it('opponent grid is not visible in player view', () => {
      const h = createGame();
      placeBoth(h);
      const view = h.view('Alice');
      // myGrid should only show Alice's own ships
      // We cannot directly compare, but myGrid should have Alice's ships
      // and there's no opponentGrid in PlayerView
      expect((view as any).opponentGrid).toBeUndefined();
    });

    it('opponent sunk ships are tracked', () => {
      const h = createGame();
      placeBoth(h);
      // Bob's destroyer (shipIndex 4, size 2) is at row 4, cols 0-1
      h.action('Alice', { type: 'fire', row: 4, col: 0 });
      h.action('Bob', { type: 'fire', row: 9, col: 9 });
      h.action('Alice', { type: 'fire', row: 4, col: 1 });
      const view = h.view('Alice');
      // opponentShipsSunk[4] should be true (destroyer sunk)
      expect(view.opponentShipsSunk[4]).toBe(true);
      // Others not sunk
      expect(view.opponentShipsSunk[0]).toBe(false);
    });
  });
});
