import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import {
  CATEGORY_NAMES_ZH,
  NUM_DICE,
  calculateScore,
  calculateTotalScore,
  getUpperSectionSum,
  shouldShowOwnScoreRows,
} from './shared';

function createGame(players = ['Alice', 'Bob'], seed = 'test') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

describe('Yahtzee Logic', () => {
  describe('setup', () => {
    it('auto-rolls dice for the first player', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.dice).toHaveLength(NUM_DICE);
      // Every turn starts with dice already rolled — first roll is free.
      expect(view.dice.every((d: number) => d >= 1 && d <= 6)).toBe(true);
      expect(view.heldDice.every((h: boolean) => !h)).toBe(true);
      expect(view.rollsLeft).toBe(2);
      expect(view.roundNumber).toBe(1);
      expect(view.phase).toBe('scoring');
      expect(view.currentPlayer).toBe('Alice');
      expect(view.winner).toBeNull();
    });

    it('initializes all player scores to -1', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.players).toHaveLength(2);
      for (const p of view.players) {
        expect(p.scores.every((s: number) => s === -1)).toBe(true);
        expect(p.yahtzeeBonus).toBe(0);
      }
    });
  });

  describe('roll action', () => {
    it('decrements rollsLeft', () => {
      const h = createGame();
      h.action('Alice', { type: 'roll' });
      expect(h.view('Alice').rollsLeft).toBe(1);
    });

    it('changes dice values after rolling', () => {
      const h = createGame();
      h.action('Alice', { type: 'roll' });
      const view = h.view('Alice');
      expect(view.dice.every((d: number) => d >= 1 && d <= 6)).toBe(true);
    });

    it('rejects roll from non-current player', () => {
      const h = createGame();
      const result = h.action('Bob', { type: 'roll' });
      expect(result.ok).toBe(false);
    });

    it('rejects roll when rollsLeft is 0', () => {
      const h = createGame();
      // Setup auto-rolled once, 2 rolls remaining
      h.action('Alice', { type: 'roll' });
      h.action('Alice', { type: 'roll' });
      const result = h.action('Alice', { type: 'roll' });
      expect(result.ok).toBe(false);
    });

    it('does not re-roll held dice', () => {
      const h = createGame();
      // Setup auto-rolled. Hold die 0, then re-roll.
      const diceAfterAutoRoll = [...h.view('Alice').dice];
      h.action('Alice', { type: 'hold', diceIndex: 0 });
      h.action('Alice', { type: 'roll' });
      const diceAfterSecondRoll = h.view('Alice').dice;
      expect(diceAfterSecondRoll[0]).toBe(diceAfterAutoRoll[0]);
    });
  });

  describe('hold action', () => {
    it('toggles held state', () => {
      const h = createGame();
      h.action('Alice', { type: 'hold', diceIndex: 2 });
      expect(h.view('Alice').heldDice[2]).toBe(true);
      h.action('Alice', { type: 'hold', diceIndex: 2 });
      expect(h.view('Alice').heldDice[2]).toBe(false);
    });

    it('rejects hold from non-current player', () => {
      const h = createGame();
      const result = h.action('Bob', { type: 'hold', diceIndex: 0 });
      expect(result.ok).toBe(false);
    });

    it('rejects hold when rollsLeft is 0', () => {
      const h = createGame();
      // Setup auto-rolled (1 initial), then 2 manual rolls exhaust rollsLeft.
      h.action('Alice', { type: 'roll' });
      h.action('Alice', { type: 'roll' });
      const result = h.action('Alice', { type: 'hold', diceIndex: 0 });
      expect(result.ok).toBe(false);
    });
  });

  describe('score action', () => {
    it('fills a category and advances turn', () => {
      const h = createGame();
      // Dice already rolled by setup — score immediately.
      h.action('Alice', { type: 'score', category: 12 }); // chance
      const view = h.view('Alice');
      expect(view.currentPlayer).toBe('Bob');
      const aliceScore = view.players.find((p: any) => p.id === 'Alice');
      expect(aliceScore?.scores[12]).toBeGreaterThanOrEqual(0);
    });

    it('auto-rolls dice for the next player', () => {
      const h = createGame();
      h.action('Alice', { type: 'score', category: 12 });
      const view = h.view('Bob');
      expect(view.dice.every((d: number) => d >= 1 && d <= 6)).toBe(true);
      expect(view.heldDice.every((hd: boolean) => !hd)).toBe(true);
      expect(view.rollsLeft).toBe(2);
      expect(view.phase).toBe('scoring');
    });

    it('rejects scoring already-filled category', () => {
      const h = createGame();
      h.action('Alice', { type: 'score', category: 12 });
      h.action('Bob', { type: 'score', category: 12 });
      // Alice's turn again
      const result = h.action('Alice', { type: 'score', category: 12 });
      expect(result.ok).toBe(false);
    });

    it('increments roundNumber after all players score', () => {
      const h = createGame();
      h.action('Alice', { type: 'score', category: 0 }); // ones
      h.action('Bob', { type: 'score', category: 0 });
      expect(h.view('Alice').roundNumber).toBe(2);
    });
  });

  describe('game end', () => {
    it('finishes after 13 rounds (2 players)', () => {
      const h = createGame(['Alice', 'Bob']);
      // Each player scores one category per round; dice are pre-rolled.
      for (let round = 0; round < 13; round++) {
        for (const player of ['Alice', 'Bob']) {
          h.action(player, { type: 'score', category: round });
        }
      }
      expect(h.isFinished).toBe(true);
    });

    it('sets a winner at game end', () => {
      const h = createGame(['Alice', 'Bob']);
      for (let round = 0; round < 13; round++) {
        for (const player of ['Alice', 'Bob']) {
          h.action(player, { type: 'score', category: round });
        }
      }
      const view = h.view('Alice');
      expect(view.winner).not.toBeNull();
      expect(view.phase).toBe('finished');
    });
  });

  describe('score calculations', () => {
    it('calculates upper section correctly', () => {
      expect(calculateScore(0, [1, 1, 2, 3, 4])).toBe(2); // ones: 2x1
      expect(calculateScore(1, [2, 2, 2, 3, 4])).toBe(6); // twos: 3x2
      expect(calculateScore(5, [6, 6, 6, 6, 6])).toBe(30); // sixes: 5x6
    });

    it('calculates three of a kind', () => {
      expect(calculateScore(6, [3, 3, 3, 1, 2])).toBe(12);
      expect(calculateScore(6, [1, 2, 3, 4, 5])).toBe(0);
    });

    it('calculates four of a kind', () => {
      expect(calculateScore(7, [4, 4, 4, 4, 2])).toBe(18);
      expect(calculateScore(7, [1, 1, 1, 2, 3])).toBe(0);
    });

    it('calculates full house', () => {
      expect(calculateScore(8, [2, 2, 3, 3, 3])).toBe(25);
      expect(calculateScore(8, [1, 2, 3, 4, 5])).toBe(0);
    });

    it('calculates small straight', () => {
      expect(calculateScore(9, [1, 2, 3, 4, 6])).toBe(30);
      expect(calculateScore(9, [2, 3, 4, 5, 1])).toBe(30);
      expect(calculateScore(9, [3, 4, 5, 6, 2])).toBe(30);
      expect(calculateScore(9, [1, 1, 2, 3, 6])).toBe(0);
    });

    it('calculates large straight', () => {
      expect(calculateScore(10, [1, 2, 3, 4, 5])).toBe(40);
      expect(calculateScore(10, [2, 3, 4, 5, 6])).toBe(40);
      expect(calculateScore(10, [1, 2, 3, 4, 6])).toBe(0);
    });

    it('calculates yahtzee', () => {
      expect(calculateScore(11, [5, 5, 5, 5, 5])).toBe(50);
      expect(calculateScore(11, [1, 2, 3, 4, 5])).toBe(0);
    });

    it('calculates chance as sum', () => {
      expect(calculateScore(12, [1, 2, 3, 4, 5])).toBe(15);
      expect(calculateScore(12, [6, 6, 6, 6, 6])).toBe(30);
    });

    it('calculates upper section bonus', () => {
      const scores = Array(13).fill(-1);
      scores[0] = 3; // ones: 3
      scores[1] = 6; // twos: 6
      scores[2] = 9; // threes: 9
      scores[3] = 12; // fours: 12
      scores[4] = 15; // fives: 15
      scores[5] = 18; // sixes: 18 => total = 63
      const total = calculateTotalScore(scores, 0);
      expect(getUpperSectionSum(scores)).toBe(63);
      expect(total).toBe(63 + 35); // 35 bonus
    });

    it('category names match expected count', () => {
      expect(CATEGORY_NAMES_ZH).toHaveLength(13);
    });
  });

  describe('activity log', () => {
    it('emits log.roll NOTIFY_ALL on roll', () => {
      const h = createGame();
      h.action('Alice', { type: 'roll' });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.roll',
        actorId: 'Alice',
        kind: 'action',
      });
    });

    it('emits log.score NOTIFY_ALL on scoring', () => {
      const h = createGame();
      h.action('Alice', { type: 'score', category: 12 });
      const notify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.score',
      );
      // score could be 0 (log.zeroScore) or positive (log.score)
      expect((notify as any)?.payload?.channel).toBe('log');
      expect((notify as any)?.payload?.actorId).toBe('Alice');
    });
  });

  describe('scoresheet visibility — US-003 regression', () => {
    // The bug: viewing another player's scorecard made the viewer's own rows
    // appear empty. Root cause was the UI gating `shouldShowOwnScoreRows` on
    // `showExpanded || isMyTurn` while defaulting `showExpanded` to false —
    // so on every other-player turn the panel collapsed, and toggling the
    // opponent dialog made the empty state obvious. The fix defaults
    // `showExpanded` to true; this suite pins the pure predicate's contract.
    it('renders own rows when expanded, regardless of whose turn it is', () => {
      expect(shouldShowOwnScoreRows(true, false)).toBe(true);
      expect(shouldShowOwnScoreRows(true, true)).toBe(true);
    });

    it('renders own rows on my turn even when collapsed', () => {
      expect(shouldShowOwnScoreRows(false, true)).toBe(true);
    });

    it('hides own rows only when explicitly collapsed during another turn', () => {
      expect(shouldShowOwnScoreRows(false, false)).toBe(false);
    });

    it('opponent view transitions do not mutate own score state', () => {
      // Simulates "switch to another player then back to self": Alice scores,
      // then Bob scores, then we inspect Alice's player-view — her scores
      // array must be unchanged. Any client-side "selection" of another
      // player is a pure view concern and cannot touch server state, so this
      // test pins the invariant that enables the UI fix to be safe.
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'score', category: 12 });
      const aliceBefore = h.view('Alice').players.find((p) => p.id === 'Alice');
      const scoresSnapshot = [...(aliceBefore?.scores ?? [])];

      // Bob plays through (roll is automatic on turn-start via setup semantics
      // of Yahtzee; he just needs to score).
      h.action('Bob', { type: 'score', category: 12 });

      const aliceAfter = h.view('Alice').players.find((p) => p.id === 'Alice');
      expect(aliceAfter?.scores).toEqual(scoresSnapshot);
    });
  });
});
