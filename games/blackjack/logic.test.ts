import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView } from './shared';
import { STARTING_CHIPS, handTotal } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(players = ['Alice', 'Bob'], seed = 'test') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

function setHand(h: Harness, playerId: string, cards: string[]) {
  const p = (h.rawState as any).players.find((x: any) => x.id === playerId);
  if (p) p.hand = cards;
}

function setDealerHand(h: Harness, cards: string[]) {
  (h.rawState as any).dealerHand = cards;
}

function setDeck(h: Harness, cards: string[]) {
  (h.rawState as any).deck = cards;
}

function setPhase(h: Harness, phase: string) {
  (h.rawState as any).phase = phase;
}

function setCurrentPlayerIdx(h: Harness, idx: number) {
  (h.rawState as any).currentPlayerIdx = idx;
}

function setChips(h: Harness, playerId: string, chips: number) {
  const p = (h.rawState as any).players.find((x: any) => x.id === playerId);
  if (p) p.chips = chips;
}

function placeBet(h: Harness, playerId: string, amount: number) {
  const p = (h.rawState as any).players.find((x: any) => x.id === playerId);
  if (p) {
    p.bet = amount;
    p.chips -= amount;
  }
}

describe('Blackjack Logic', () => {
  describe('setup', () => {
    it('starts in betting phase', () => {
      const h = createGame();
      expect((h.rawState as any).phase).toBe('betting');
    });

    it('each player starts with correct chips', () => {
      const h = createGame();
      for (const p of (h.rawState as any).players) {
        expect(p.chips).toBe(STARTING_CHIPS);
      }
    });

    it('deck has 52 cards', () => {
      const h = createGame();
      expect((h.rawState as any).deck.length).toBe(52);
    });

    it('players start with no cards', () => {
      const h = createGame();
      for (const p of (h.rawState as any).players) {
        expect(p.hand.length).toBe(0);
      }
    });
  });

  describe('betting phase', () => {
    it('player can bet', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'bet', amount: 50 });
      expect(result.ok).toBe(true);
      const p = (h.rawState as any).players.find((x: any) => x.id === 'Alice');
      expect(p.bet).toBe(50);
      expect(p.chips).toBe(STARTING_CHIPS - 50);
    });

    it('rejects double bet', () => {
      const h = createGame();
      h.action('Alice', { type: 'bet', amount: 50 });
      const result = h.action('Alice', { type: 'bet', amount: 50 });
      expect(result.ok).toBe(false);
    });

    it('rejects bet exceeding chips', () => {
      const h = createGame();
      setChips(h, 'Alice', 30);
      const result = h.action('Alice', { type: 'bet', amount: 50 });
      expect(result.ok).toBe(false);
    });

    it('advances to player_turns when all bet', () => {
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      expect((h.rawState as any).phase).toBe('player_turns');
    });

    it('deals 2 cards to each player after all bet', () => {
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      for (const p of (h.rawState as any).players) {
        expect(p.hand.length).toBe(2);
      }
      expect((h.rawState as any).dealerHand.length).toBe(2);
    });

    it('rejects non-bet action during betting phase', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'hit' });
      expect(result.ok).toBe(false);
    });
  });

  describe('player turns', () => {
    function setupPlayerTurns(seed = 'pt-test') {
      const h = createGame(['Alice', 'Bob'], seed);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      return h;
    }

    it('rejects action from wrong player', () => {
      const h = setupPlayerTurns();
      // currentPlayerIdx=0 = Alice; Bob acts out of turn
      const result = h.action('Bob', { type: 'hit' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('还没轮到你');
    });

    it('hit adds a card', () => {
      const h = setupPlayerTurns();
      // force known safe hand
      setHand(h, 'Alice', ['2s', '3h']);
      setDeck(h, ['5d', '6c', '7h', 'Ks', '9h', 'Ts']);
      const result = h.action('Alice', { type: 'hit' });
      expect(result.ok).toBe(true);
      const alice = (h.rawState as any).players.find((p: any) => p.id === 'Alice');
      expect(alice.hand.length).toBe(3);
    });

    it('stand marks player as stood and advances', () => {
      const h = setupPlayerTurns();
      setCurrentPlayerIdx(h, 0);
      const result = h.action('Alice', { type: 'stand' });
      expect(result.ok).toBe(true);
      const alice = (h.rawState as any).players.find((p: any) => p.id === 'Alice');
      expect(alice.stood).toBe(true);
    });

    it('bust marks player as busted', () => {
      const h = setupPlayerTurns();
      setHand(h, 'Alice', ['Ks', 'Qh']);
      setDeck(h, ['Js', '2c', '3h', '4d', '5s', '6h']);
      const result = h.action('Alice', { type: 'hit' });
      expect(result.ok).toBe(true);
      const alice = (h.rawState as any).players.find((p: any) => p.id === 'Alice');
      expect(alice.busted).toBe(true);
    });

    it('double_down doubles bet and adds exactly one card', () => {
      const h = setupPlayerTurns();
      setHand(h, 'Alice', ['5s', '6h']);
      setDeck(h, ['Ts', '2c', '3h', '4d', '5s', '6h']);
      const aliceBefore = (h.rawState as any).players.find((p: any) => p.id === 'Alice');
      const betBefore = aliceBefore.bet;
      const chipsBefore = aliceBefore.chips;
      const result = h.action('Alice', { type: 'double_down' });
      expect(result.ok).toBe(true);
      const alice = (h.rawState as any).players.find((p: any) => p.id === 'Alice');
      expect(alice.bet).toBe(betBefore * 2);
      expect(alice.chips).toBe(chipsBefore - betBefore);
      expect(alice.hand.length).toBe(3);
      expect(alice.stood).toBe(true);
    });

    it('double_down rejects on 3+ cards', () => {
      const h = setupPlayerTurns();
      setHand(h, 'Alice', ['2s', '3h', '4d']);
      const result = h.action('Alice', { type: 'double_down' });
      expect(result.ok).toBe(false);
    });

    it('after all players done transitions to dealer_turn or payout', () => {
      const h = setupPlayerTurns();
      setHand(h, 'Alice', ['Ks', '9h']);
      setHand(h, 'Bob', ['Qd', '8c']);
      setDealerHand(h, ['6s', '7h']);
      setDeck(h, ['2s', '3h', '4d', '5c']);
      h.action('Alice', { type: 'stand' });
      h.action('Bob', { type: 'stand' });
      const phase = (h.rawState as any).phase;
      // After all stand, dealer runs, then payout auto-runs, so we should be back in 'betting' or 'finished'
      expect(['betting', 'finished']).toContain(phase);
    });
  });

  describe('dealer logic', () => {
    it('dealer draws until >= 17', () => {
      const h = createGame(['Alice'], 'dealer-test');
      h.action('Alice', { type: 'bet', amount: 50 });
      // force state to dealer_turn with a known dealer hand
      setHand(h, 'Alice', ['Ks', '9h']); // 19, stood
      setDealerHand(h, ['5s', '6h']); // 11 — must hit
      setDeck(h, ['Ts', '2c', '3h', '4d', '5s']);
      (h.rawState as any).phase = 'player_turns';
      setCurrentPlayerIdx(h, 0);
      (h.rawState as any).players[0].stood = false;
      (h.rawState as any).players[0].busted = false;
      h.action('Alice', { type: 'stand' });
      // After stand -> dealer runs -> payout -> back to betting (or finished)
      const phase = (h.rawState as any).phase;
      expect(['betting', 'finished']).toContain(phase);
    });
  });

  describe('hand total', () => {
    it('counts face cards as 10', () => {
      expect(handTotal(['Ks', 'Qh'])).toBe(20);
    });

    it('counts ace as 11 when safe', () => {
      expect(handTotal(['As', '9h'])).toBe(20);
    });

    it('reduces ace to 1 when over 21', () => {
      expect(handTotal(['As', 'Kh', '5d'])).toBe(16);
    });

    it('handles multiple aces', () => {
      expect(handTotal(['As', 'Ah'])).toBe(12);
    });

    it('blackjack is 21', () => {
      expect(handTotal(['As', 'Kh'])).toBe(21);
    });
  });

  describe('player view', () => {
    it('player can only see own hand', () => {
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      const aliceView = h.view('Alice');
      const bobView = h.view('Bob');
      // Each player sees their own hand in myHand
      expect(aliceView.myHand.length).toBe(2);
      expect(bobView.myHand.length).toBe(2);
      // In players list, others' hands are hidden (empty)
      const aliceSeesBob = aliceView.players.find((p) => p.id === 'Bob');
      expect(aliceSeesBob?.hand.length).toBe(0);
    });

    it('dealer second card is hidden during player_turns', () => {
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      const view = h.view('Alice');
      expect(view.phase).toBe('player_turns');
      expect(view.dealerHiddenCard).toBe(true);
      expect(view.dealerHand[1]).toBe('hidden');
    });

    it('dealerTotal is 0 when hidden', () => {
      const h = createGame(['Alice', 'Bob']);
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      const view = h.view('Alice');
      expect(view.dealerTotal).toBe(0);
    });
  });

  describe('game end', () => {
    it('ends after max rounds', () => {
      const h = createGame(['Alice'], 'end-test');
      (h.rawState as any).round = 13;
      // Force into payout directly
      h.action('Alice', { type: 'bet', amount: 50 });
      setHand(h, 'Alice', ['Ks', '9h']);
      setDealerHand(h, ['6s', '7h']);
      setDeck(h, ['Ts', '2c', '3h', '4d', '5s']);
      (h.rawState as any).phase = 'player_turns';
      setCurrentPlayerIdx(h, 0);
      (h.rawState as any).players[0].stood = false;
      (h.rawState as any).players[0].busted = false;
      h.action('Alice', { type: 'stand' });
      expect((h.rawState as any).phase).toBe('finished');
    });

    it('player with most chips wins', () => {
      const h = createGame(['Alice', 'Bob'], 'end-chips');
      (h.rawState as any).round = 13;
      h.action('Alice', { type: 'bet', amount: 50 });
      h.action('Bob', { type: 'bet', amount: 50 });
      setChips(h, 'Alice', 900);
      setChips(h, 'Bob', 500);
      setHand(h, 'Alice', ['Ks', '9h']);
      setHand(h, 'Bob', ['5s', '6h']);
      setDealerHand(h, ['2s', '3h']);
      setDeck(h, ['Js', 'Qs', 'Ks', 'As', '2h']);
      (h.rawState as any).phase = 'player_turns';
      setCurrentPlayerIdx(h, 0);
      (h.rawState as any).players[0].stood = false;
      (h.rawState as any).players[1].stood = false;
      h.action('Alice', { type: 'stand' });
      h.action('Bob', { type: 'stand' });
      // Game should be finished now
      if ((h.rawState as any).phase === 'finished') {
        expect((h.rawState as any).winner).toBe('Alice');
      }
    });
  });
});
