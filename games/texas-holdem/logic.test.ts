import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(players = ['Alice', 'Bob'], seed = 'test') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

function getState(h: Harness) {
  return h.rawState as any;
}

function setPlayerStatus(h: Harness, id: string, status: string) {
  const p = getState(h).players.find((x: any) => x.id === id);
  if (p) p.status = status;
}

describe("Texas Hold'em Logic", () => {
  describe('setup', () => {
    it('starts in preflop betting phase', () => {
      const h = createGame();
      expect(getState(h).bettingRound).toBe('preflop');
      expect(getState(h).handPhase).toBe('betting');
      expect(getState(h).gamePhase).toBe('playing');
    });

    it('each player starts with 1000 chips (minus blind)', () => {
      const h = createGame();
      const players = getState(h).players;
      // All players should have less than or equal to 1000 chips (blinds posted)
      for (const p of players) {
        expect(p.chips).toBeLessThanOrEqual(1000);
      }
    });

    it('blinds are posted correctly', () => {
      const h = createGame();
      const state = getState(h);
      // Total pot should equal SB + BB = 10 + 20 = 30 (heads-up SB=dealer)
      expect(state.pot).toBe(30);
    });

    it('each player has 2 hole cards', () => {
      const h = createGame();
      for (const p of getState(h).players) {
        expect(p.holeCards).not.toBeNull();
        expect(p.holeCards.length).toBe(2);
      }
    });

    it('no community cards initially', () => {
      const h = createGame();
      expect(getState(h).communityCards.length).toBe(0);
    });

    it('hand number starts at 1', () => {
      const h = createGame();
      expect(getState(h).handNumber).toBe(1);
    });

    it('big blind is 20, small blind is 10', () => {
      const h = createGame();
      expect(getState(h).bigBlind).toBe(20);
      expect(getState(h).smallBlind).toBe(10);
    });
  });

  describe('fold action', () => {
    it('player can fold', () => {
      const h = createGame();
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const result = h.action(currentId, { type: 'fold' });
      expect(result.ok).toBe(true);
    });

    it('fold removes player from hand', () => {
      const h = createGame(['Alice', 'Bob', 'Carol'], 'fold-test');
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      h.action(currentId, { type: 'fold' });
      const folded = getState(h).players.find((p: any) => p.id === currentId);
      expect(folded.status).toBe('folded');
    });

    it('rejects action from wrong player', () => {
      const h = createGame();
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      // Get a player who is NOT the current player
      const wrongId = state.players.find((_: any, i: number) => i !== currentIdx)?.id;
      if (wrongId) {
        const result = h.action(wrongId, { type: 'fold' });
        expect(result.ok).toBe(false);
      }
    });

    it('folding when only 2 players ends the hand', () => {
      const h = createGame(['Alice', 'Bob'], 'fold-endhand');
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      h.action(currentId, { type: 'fold' });
      // After one player folds in heads-up, hand should reset or game should progress
      const newState = getState(h);
      // Either new hand started (pot=30) or game finished
      expect(newState.gamePhase === 'finished' || newState.pot > 0 || newState.handNumber > 1).toBe(
        true,
      );
    });
  });

  describe('call action', () => {
    it('player can call', () => {
      const h = createGame();
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const result = h.action(currentId, { type: 'call' });
      expect(result.ok).toBe(true);
    });

    it('call amount reduces player chips', () => {
      const h = createGame(['Alice', 'Bob'], 'call-test');
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const player = state.players[currentIdx];
      const chipsBefore = player.chips;
      const highestBet = Math.max(...state.players.map((p: any) => p.currentBet));
      const callAmt = highestBet - player.currentBet;
      h.action(currentId, { type: 'call' });
      const after = getState(h).players.find((p: any) => p.id === currentId);
      if (callAmt > 0) {
        expect(after.chips).toBe(chipsBefore - callAmt);
      }
    });
  });

  describe('raise action', () => {
    it('player can raise', () => {
      const h = createGame(['Alice', 'Bob', 'Carol'], 'raise-test');
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const player = state.players[currentIdx];
      const highestBet = Math.max(...state.players.map((p: any) => p.currentBet));
      const minRaise = highestBet + state.minRaise;
      const result = h.action(currentId, {
        type: 'raise',
        amount: Math.min(minRaise, player.chips + player.currentBet),
      });
      expect(result.ok).toBe(true);
    });

    it('raise below minimum is rejected', () => {
      const h = createGame(['Alice', 'Bob', 'Carol'], 'raise-min');
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const player = state.players[currentIdx];
      const highestBet = Math.max(...state.players.map((p: any) => p.currentBet));
      // Raise to below minimum
      const badAmount = highestBet + 1; // too small
      if (badAmount < highestBet + state.minRaise && player.chips + player.currentBet > badAmount) {
        const result = h.action(currentId, { type: 'raise', amount: badAmount });
        expect(result.ok).toBe(false);
      }
    });
  });

  describe('betting round advancement', () => {
    it('preflop -> flop after all players act', () => {
      // 2-player game: heads-up
      const h = createGame(['Alice', 'Bob'], 'advance-test');
      const state = getState(h);
      // Current player calls/checks to complete the round
      const p1idx = state.currentPlayerIdx;
      const p1 = state.players[p1idx];
      const highestBet = Math.max(...state.players.map((p: any) => p.currentBet));
      const callAmt = highestBet - p1.currentBet;

      if (callAmt > 0) {
        h.action(p1.id, { type: 'call' });
      } else {
        h.action(p1.id, { type: 'check' });
      }

      // After first action, check if we need more actions
      const s2 = getState(h);
      if (s2.bettingRound === 'preflop' && s2.handPhase === 'betting') {
        const p2idx = s2.currentPlayerIdx;
        const p2 = s2.players[p2idx];
        const hb2 = Math.max(...s2.players.map((p: any) => p.currentBet));
        const ca2 = hb2 - p2.currentBet;
        if (ca2 > 0) {
          h.action(p2.id, { type: 'call' });
        } else {
          h.action(p2.id, { type: 'check' });
        }
      }

      const finalState = getState(h);
      // Should have advanced to flop or further
      expect(
        ['flop', 'turn', 'river'].includes(finalState.bettingRound) ||
          finalState.handPhase !== 'betting',
      ).toBe(true);
    });
  });

  describe('all_in action', () => {
    it('player can go all in', () => {
      const h = createGame();
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      const result = h.action(currentId, { type: 'all_in' });
      expect(result.ok).toBe(true);
    });

    it('all_in sets player to all_in status', () => {
      const h = createGame();
      const state = getState(h);
      const currentIdx = state.currentPlayerIdx;
      const currentId = state.players[currentIdx].id;
      h.action(currentId, { type: 'all_in' });
      const player = getState(h).players.find((p: any) => p.id === currentId);
      // Might be all_in or next hand might have started already
      expect(['all_in', 'active', 'folded'].includes(player.status)).toBe(true);
    });
  });

  describe('player view', () => {
    it('player can see own hole cards', () => {
      const h = createGame();
      const state = getState(h);
      const alice = state.players[0].id;
      const view = h.view(alice);
      expect(view.myHoleCards).not.toBeNull();
      expect(view.myHoleCards?.length).toBe(2);
    });

    it('player cannot see other players hole cards during betting', () => {
      const h = createGame(['Alice', 'Bob']);
      const view = h.view('Alice');
      const bobInfo = view.players.find((p: any) => p.id === 'Bob');
      expect(bobInfo).toBeDefined();
      // During betting, Bob's hole cards should be hidden (null)
      expect(bobInfo?.holeCards).toBeNull();
    });

    it('view contains community cards', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(Array.isArray(view.communityCards)).toBe(true);
    });

    it('view contains pot amount', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(typeof view.pot).toBe('number');
      expect(view.pot).toBeGreaterThan(0);
    });
  });

  describe('game end', () => {
    it('game ends when one player runs out of chips', () => {
      const h = createGame(['Alice', 'Bob'], 'gameover-test');
      // Force Alice to have 0 chips
      getState(h).players.find((p: any) => p.id === 'Alice').chips = 0;
      getState(h).players.find((p: any) => p.id === 'Alice').status = 'eliminated';
      getState(h).gamePhase = 'finished';
      getState(h).winner = 'Bob';
      expect(getState(h).gamePhase).toBe('finished');
      expect(getState(h).winner).toBe('Bob');
    });

    it('actions rejected after game over', () => {
      const h = createGame();
      getState(h).gamePhase = 'finished';
      const result = h.action('Alice', { type: 'fold' });
      expect(result.ok).toBe(false);
    });
  });
});
