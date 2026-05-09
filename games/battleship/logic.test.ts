import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView, ShipDefinition, ShipPlacement } from './shared';
import { CLASSIC_SHIPS, FAST_MODE_SHOTS_PER_TURN, GRID_SIZE, IRREGULAR_FLEET } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(seed = 'test', config?: unknown) {
  const h = new GameTestHarness(logic, { players: ['Alice', 'Bob'], seed, config });
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

  describe('activity log', () => {
    it('emits log.placeShips NOTIFY_ALL on placement', () => {
      const h = createGame();
      h.action('Alice', { type: 'place_ships', placements: buildPlacements() });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.placeShips',
        actorId: 'Alice',
        kind: 'action',
      });
    });

    it('emits log.miss NOTIFY_ALL on miss', () => {
      const h = createGame();
      placeBoth(h);
      h.action('Alice', { type: 'fire', row: 9, col: 9 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.miss',
        actorId: 'Alice',
        kind: 'action',
      });
    });

    it('emits log.hit NOTIFY_ALL on hit', () => {
      const h = createGame();
      placeBoth(h);
      h.action('Alice', { type: 'fire', row: 0, col: 0 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.hit',
        actorId: 'Alice',
        kind: 'action',
      });
    });

    it('emits log.win NOTIFY_ALL on winning shot', () => {
      const h = createGame();
      placeBoth(h);
      const shipCells: [number, number][] = [];
      for (const [shipIdx, ship] of CLASSIC_SHIPS.entries()) {
        for (let c = 0; c < ship.offsets.length; c++) {
          shipCells.push([shipIdx, c]);
        }
      }
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
          const target = bobTargets[bobFires++];
          if (target) h.action('Bob', { type: 'fire', row: target[0], col: target[1] });
        }
      }
      const winNotify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.win',
      );
      expect((winNotify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.win',
        actorId: 'Alice',
        kind: 'system',
      });
    });
  });

  describe('fastMode (5 shots per turn)', () => {
    it('defaults fastMode=false and passes turn after 1 shot', () => {
      const h = createGame();
      placeBoth(h);
      expect(h.view('Alice').fastMode).toBe(false);
      expect(h.view('Alice').shotsRemaining).toBe(1);
      h.action('Alice', { type: 'fire', row: 9, col: 9 });
      expect(h.view('Alice').currentPlayer).toBe('Bob');
    });

    it('with fastMode=true Alice keeps turn for 5 shots then auto-passes', () => {
      const h = createGame('test', { fastMode: true });
      placeBoth(h);
      expect(h.view('Alice').fastMode).toBe(true);
      expect(h.view('Alice').shotsRemaining).toBe(FAST_MODE_SHOTS_PER_TURN);

      for (let i = 0; i < FAST_MODE_SHOTS_PER_TURN - 1; i++) {
        h.action('Alice', { type: 'fire', row: 9, col: i });
        expect(h.view('Alice').currentPlayer).toBe('Alice');
        expect(h.view('Alice').shotsRemaining).toBe(FAST_MODE_SHOTS_PER_TURN - (i + 1));
      }

      // 5th shot auto-passes
      h.action('Alice', { type: 'fire', row: 9, col: FAST_MODE_SHOTS_PER_TURN - 1 });
      expect(h.view('Alice').currentPlayer).toBe('Bob');
      expect(h.view('Alice').shotsRemaining).toBe(FAST_MODE_SHOTS_PER_TURN);
    });

    it('end_turn action passes turn mid-turn in fastMode', () => {
      const h = createGame('test', { fastMode: true });
      placeBoth(h);
      h.action('Alice', { type: 'fire', row: 9, col: 9 });
      h.action('Alice', { type: 'fire', row: 9, col: 8 });
      expect(h.view('Alice').shotsRemaining).toBe(FAST_MODE_SHOTS_PER_TURN - 2);
      const result = h.action('Alice', { type: 'end_turn' });
      expect(result.ok).toBe(true);
      expect(h.view('Alice').currentPlayer).toBe('Bob');
      expect(h.view('Alice').shotsRemaining).toBe(FAST_MODE_SHOTS_PER_TURN);
    });

    it('end_turn rejected when fastMode is off', () => {
      const h = createGame();
      placeBoth(h);
      const result = h.action('Alice', { type: 'end_turn' });
      expect(result.ok).toBe(false);
    });

    it('end_turn rejected from non-current player', () => {
      const h = createGame('test', { fastMode: true });
      placeBoth(h);
      const result = h.action('Bob', { type: 'end_turn' });
      expect(result.ok).toBe(false);
    });

    it('end_turn rejected before firing phase', () => {
      const h = createGame('test', { fastMode: true });
      const result = h.action('Alice', { type: 'end_turn' });
      expect(result.ok).toBe(false);
    });

    it('invalid config falls back to classic mode', () => {
      const h = createGame('test', { fastMode: 'oops' });
      placeBoth(h);
      expect(h.view('Alice').fastMode).toBe(false);
      expect(h.view('Alice').shotsRemaining).toBe(1);
    });
  });

  describe('irregularShips option', () => {
    function isStraight(ship: ShipDefinition): boolean {
      if (ship.offsets.length <= 1) return true;
      const allSameRow = ship.offsets.every((o) => o[0] === ship.offsets[0][0]);
      const allSameCol = ship.offsets.every((o) => o[1] === ship.offsets[0][1]);
      return allSameRow || allSameCol;
    }

    it('irregularShips=false keeps the classic straight fleet unchanged', () => {
      const h = createGame('test', { irregularShips: false });
      const fleet = h.rawState.fleet as ShipDefinition[];
      expect(fleet).toBe(CLASSIC_SHIPS);
      expect(fleet).toHaveLength(CLASSIC_SHIPS.length);
      expect(fleet.every(isStraight)).toBe(true);
      const totalCells = fleet.reduce((sum, s) => sum + s.offsets.length, 0);
      expect(totalCells).toBe(17);
    });

    it('defaults irregularShips=false when config omitted', () => {
      const h = createGame();
      const fleet = h.rawState.fleet as ShipDefinition[];
      expect(fleet).toBe(CLASSIC_SHIPS);
    });

    it('irregularShips=true yields zero straight ships and ~17 total cells', () => {
      const h = createGame('test', { irregularShips: true });
      const fleet = h.rawState.fleet as ShipDefinition[];
      expect(fleet).toHaveLength(IRREGULAR_FLEET.length);
      expect(fleet.some(isStraight)).toBe(false);
      const totalCells = fleet.reduce((sum, s) => sum + s.offsets.length, 0);
      expect(totalCells).toBeGreaterThanOrEqual(15);
      expect(totalCells).toBeLessThanOrEqual(19);
    });

    it('irregularShips=true fleet names come from SHIP_SHAPES ids', () => {
      const h = createGame('test', { irregularShips: true });
      const fleet = h.rawState.fleet as ShipDefinition[];
      const names = fleet.map((s) => s.name);
      expect(names).toEqual([...IRREGULAR_FLEET]);
    });

    it('invalid irregularShips config falls back to classic fleet', () => {
      const h = createGame('test', { irregularShips: 'nope' });
      const fleet = h.rawState.fleet as ShipDefinition[];
      expect(fleet).toBe(CLASSIC_SHIPS);
    });

    it('PlayerView exposes irregularShips flag', () => {
      const classic = createGame('test', { irregularShips: false });
      expect(classic.view('Alice').irregularShips).toBe(false);
      const spectatorClassic = logic.getSpectatorView?.(classic.rawState as never);
      expect(spectatorClassic?.irregularShips).toBe(false);

      const irregular = createGame('test', { irregularShips: true });
      expect(irregular.view('Alice').irregularShips).toBe(true);
      const spectatorIrregular = logic.getSpectatorView?.(irregular.rawState as never);
      expect(spectatorIrregular?.irregularShips).toBe(true);
    });
  });

  describe('irregularShips place + fire', () => {
    // Non-overlapping placement for the 4-ship irregular fleet (U, Z, L, T).
    // Cells: U={(0,0),(0,2),(1,0),(1,1),(1,2)}, Z={(3,0),(3,1),(4,1),(4,2)},
    //        L={(0,5),(1,5),(2,5),(2,6)}, T={(6,0),(6,1),(6,2),(7,1)}.
    function irregularPlacements(): ShipPlacement[] {
      return [
        { shipIndex: 0, row: 0, col: 0, rotation: 0 },
        { shipIndex: 1, row: 3, col: 0, rotation: 0 },
        { shipIndex: 2, row: 0, col: 5, rotation: 0 },
        { shipIndex: 3, row: 6, col: 0, rotation: 0 },
      ];
    }

    it('place U-shape near right edge fails (out of bounds)', () => {
      const h = createGame('test', { irregularShips: true });
      const placements = irregularPlacements();
      // U is 2x3 in its base orientation; at col 8 it would need col 10.
      placements[0] = { shipIndex: 0, row: 0, col: 8, rotation: 0 };
      const result = h.action('Alice', { type: 'place_ships', placements });
      expect(result.ok).toBe(false);
    });

    it('irregular placement rejects overlap between two shapes', () => {
      const h = createGame('test', { irregularShips: true });
      const placements = irregularPlacements();
      // Move Z onto cell (1,0), which is already occupied by U.
      placements[1] = { shipIndex: 1, row: 1, col: 0, rotation: 0 };
      const result = h.action('Alice', { type: 'place_ships', placements });
      expect(result.ok).toBe(false);
    });

    it('valid irregular placement accepted and matches U cell count', () => {
      const h = createGame('test', { irregularShips: true });
      const result = h.action('Alice', { type: 'place_ships', placements: irregularPlacements() });
      expect(result.ok).toBe(true);
      // Ship value 1 = U (5 cells); grid should record exactly 5 ones.
      const grid = h.rawState.players[0].grid as number[];
      const uCells = grid.filter((v) => v === 1).length;
      expect(uCells).toBe(5);
    });

    it('fire hits one cell then sinks U only after all 5 cells are hit', () => {
      const h = createGame('test', { irregularShips: true });
      h.action('Alice', { type: 'place_ships', placements: irregularPlacements() });
      h.action('Bob', { type: 'place_ships', placements: irregularPlacements() });
      // Bob's U occupies (0,0),(0,2),(1,0),(1,1),(1,2). Alice fires them one by
      // one, with a harmless Bob shot between each to keep turn parity.
      const uCells: [number, number][] = [
        [0, 0],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ];
      const bobDecoys: [number, number][] = [
        [9, 9],
        [9, 8],
        [9, 7],
        [9, 6],
      ];
      for (let i = 0; i < uCells.length; i++) {
        const [row, col] = uCells[i];
        h.action('Alice', { type: 'fire', row, col });
        // After the 4th hit, U is still not sunk (one cell remaining), so
        // overall game continues and Bob still has a turn.
        if (i < uCells.length - 1) {
          expect(h.view('Alice').opponentShipsSunk[0]).toBe(false);
          const [br, bc] = bobDecoys[i];
          h.action('Bob', { type: 'fire', row: br, col: bc });
        }
      }
      // Final cell hit sinks U.
      expect(h.view('Alice').opponentShipsSunk[0]).toBe(true);
      // Other ships not sunk yet.
      expect(h.view('Alice').opponentShipsSunk[1]).toBe(false);
    });

    it('placement with rotation and with mirror both succeed on valid spots', () => {
      // L rotated 90°: cells collapse to (0,0),(0,1),(0,2),(1,0) — fits at (0,0).
      const rotated: ShipPlacement[] = [
        { shipIndex: 0, row: 5, col: 0, rotation: 0 },
        { shipIndex: 1, row: 3, col: 5, rotation: 0 },
        { shipIndex: 2, row: 0, col: 0, rotation: 1 },
        { shipIndex: 3, row: 8, col: 0, rotation: 0 },
      ];
      const h1 = createGame('test', { irregularShips: true });
      expect(h1.action('Alice', { type: 'place_ships', placements: rotated }).ok).toBe(true);

      // L mirrored: cells (0,0),(1,0),(2,0),(2,-1) -> normalize -> (0,1),(1,1),(2,0),(2,1).
      // Fits at (0, 0) occupying (0,1),(1,1),(2,0),(2,1) — does not collide with
      // U at (0,0) because U uses (0,0),(0,2),(1,0),(1,1),(1,2). Wait — U's
      // (1,1) and mirrored-L's (1,1) would clash. Place mirrored L at (5, 5)
      // instead for guaranteed isolation.
      const mirrored: ShipPlacement[] = [
        { shipIndex: 0, row: 0, col: 0, rotation: 0 },
        { shipIndex: 1, row: 3, col: 0, rotation: 0 },
        { shipIndex: 2, row: 5, col: 5, rotation: 0, mirror: true },
        { shipIndex: 3, row: 6, col: 0, rotation: 0 },
      ];
      const h2 = createGame('test', { irregularShips: true });
      expect(h2.action('Alice', { type: 'place_ships', placements: mirrored }).ok).toBe(true);
    });
  });
});
