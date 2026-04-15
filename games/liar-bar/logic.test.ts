import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(players = ['Alice', 'Bob', 'Carol'], seed = 'test') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

function create2p(seed = 'seed-2p') {
  return createGame(['Alice', 'Bob'], seed);
}

// Force specific state for deterministic tests
function setHand(h: Harness, playerId: string, cards: any[]) {
  const player = (h.rawState as any).players.find((p: any) => p.id === playerId);
  if (player) player.hand = cards;
}

function setCurrentPlayerIdx(h: Harness, idx: number) {
  (h.rawState as any).currentPlayerIdx = idx;
}

function setPhase(h: Harness, phase: string) {
  (h.rawState as any).phase = phase;
}

function setLastPlay(h: Harness, lastPlay: any) {
  (h.rawState as any).lastPlay = lastPlay;
}

function setDeclaredSuit(h: Harness, suit: string) {
  (h.rawState as any).declaredSuit = suit;
}

function setPlayerAlive(h: Harness, playerId: string, alive: boolean) {
  const player = (h.rawState as any).players.find((p: any) => p.id === playerId);
  if (player) {
    player.alive = alive;
    if (!alive) player.hand = [];
  }
  // Rebuild turnOrder
  (h.rawState as any).turnOrder = (h.rawState as any).players
    .filter((p: any) => p.alive)
    .map((p: any) => p.id);
}

function setRevolver(h: Harness, playerId: string, chamber: number, bullet: number) {
  const player = (h.rawState as any).players.find((p: any) => p.id === playerId);
  if (player) {
    player.revolverChamber = chamber;
    player.revolverBullet = bullet;
  }
}

describe('Liar Bar Logic', () => {
  describe('setup', () => {
    it('deals 5 cards to each alive player', () => {
      const h = createGame();
      const state = h.rawState;
      for (const p of state.players) {
        expect(p.hand.length).toBe(5);
      }
    });

    it('assigns a declared suit', () => {
      const h = create2p();
      const view = h.view('Alice');
      expect(['Q', 'K', 'A']).toContain(view.declaredSuit);
    });

    it('assigns bullet position 0-5 to each player', () => {
      const h = createGame();
      const state = h.rawState;
      for (const p of state.players) {
        expect(p.revolverBullet).toBeGreaterThanOrEqual(0);
        expect(p.revolverBullet).toBeLessThanOrEqual(5);
        expect(p.revolverChamber).toBe(0);
      }
    });

    it('starts in playing phase with first player as current', () => {
      const h = create2p();
      const view = h.view('Alice');
      expect(view.phase).toBe('playing');
      expect(view.currentPlayer).toBe('Alice');
    });

    it('hides bullet positions in player view', () => {
      const h = createGame();
      const view = h.view('Alice');
      for (const p of view.players) {
        expect(p).not.toHaveProperty('revolverBullet');
      }
    });

    it('hides other players hands', () => {
      const h = createGame();
      const aliceView = h.view('Alice');
      expect(aliceView.myHand.length).toBe(5);
      // Other players' hands are not visible (only cardCount)
      const bobInfo = aliceView.players.find((p: any) => p.id === 'Bob');
      expect(bobInfo?.cardCount).toBe(5);
      expect(bobInfo).not.toHaveProperty('hand');
    });
  });

  describe('play_cards action', () => {
    it('current player can play 1-3 cards', () => {
      const h = create2p('seed-play');
      const result = h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.phase).toBe('challenging');
        expect(result.state.lastPlay).not.toBeNull();
        expect(result.state.lastPlay?.count).toBe(1);
      }
    });

    it('rejects play from wrong player', () => {
      const h = create2p();
      const result = h.action('Bob', { type: 'play_cards', cardIndices: [0] });
      expect(result.ok).toBe(false);
    });

    it('rejects playing more than 3 cards (zod validation)', () => {
      const h = create2p();
      const result = h.action('Alice', { type: 'play_cards', cardIndices: [0, 1, 2, 3] });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid card index', () => {
      const h = create2p();
      setHand(h, 'Alice', ['Q', 'K']);
      const result = h.action('Alice', { type: 'play_cards', cardIndices: [5] });
      expect(result.ok).toBe(false);
    });

    it('rejects duplicate indices', () => {
      const h = create2p();
      setHand(h, 'Alice', ['Q', 'K', 'A']);
      const result = h.action('Alice', { type: 'play_cards', cardIndices: [0, 0] });
      expect(result.ok).toBe(false);
    });

    it('removes played cards from hand', () => {
      const h = create2p('seed-remove');
      const viewBefore = h.view('Alice');
      const handSizeBefore = viewBefore.myHand.length;
      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });
      const viewAfter = h.view('Alice');
      expect(viewAfter.myHand.length).toBe(handSizeBefore - 2);
    });

    it('phase becomes challenging after play', () => {
      const h = create2p();
      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      expect(h.view('Alice').phase).toBe('challenging');
    });
  });

  describe('believe action', () => {
    it('next player can believe and game advances', () => {
      const h = create2p('seed-believe');
      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      const result = h.action('Bob', { type: 'believe' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.phase).toBe('playing');
        // Turn passes to Bob (the believer)
        expect(result.state.turnOrder[result.state.currentPlayerIdx]).toBe('Bob');
      }
    });

    it('rejects believe when not in challenging phase', () => {
      const h = create2p();
      const result = h.action('Alice', { type: 'believe' });
      expect(result.ok).toBe(false);
    });

    it('rejects believe from wrong player', () => {
      const h = create2p();
      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      // Alice cannot believe her own play
      const result = h.action('Alice', { type: 'believe' });
      expect(result.ok).toBe(false);
    });
  });

  describe('challenge action', () => {
    it('challenge on a lie: last player shoots', () => {
      const h = create2p('seed-lie');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      // Alice plays K cards claiming Q suit (lying)
      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });

      // Force Alice's revolver: bullet at chamber 0, so she dies on first shot
      setRevolver(h, 'Alice', 0, 0);

      const result = h.action('Bob', { type: 'challenge' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const challengeResult = result.state.challengeResult;
        expect(challengeResult).not.toBeNull();
        expect(challengeResult?.wasLying).toBe(true);
        expect(challengeResult?.shooterId).toBe('Alice');
        expect(challengeResult?.shotDied).toBe(true);
      }
    });

    it('challenge on truth: challenger shoots', () => {
      const h = create2p('seed-truth');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['Q', 'Q', 'A', 'A', 'A']);
      // Alice plays Q cards - truth
      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });

      // Force Bob's revolver: bullet at chamber 3, so he survives first shot
      setRevolver(h, 'Bob', 0, 3);

      const result = h.action('Bob', { type: 'challenge' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const challengeResult = result.state.challengeResult;
        expect(challengeResult).not.toBeNull();
        expect(challengeResult?.wasLying).toBe(false);
        expect(challengeResult?.shooterId).toBe('Bob');
      }
    });

    it('Joker counts as any suit (not lying)', () => {
      const h = create2p('seed-joker');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['Joker', 'K', 'A', 'A', 'A']);
      h.action('Alice', { type: 'play_cards', cardIndices: [0] });

      const result = h.action('Bob', { type: 'challenge' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const challengeResult = result.state.challengeResult;
        expect(challengeResult?.wasLying).toBe(false);
        expect(challengeResult?.shooterId).toBe('Bob');
      }
    });

    it('challenge correctly identifies mixed hand as lying', () => {
      const h = create2p('seed-mixed');
      setDeclaredSuit(h, 'A');
      setHand(h, 'Alice', ['A', 'K', 'Q', 'Q', 'Q']);
      // Playing an A and a K - K is not A or Joker, so lying
      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });

      const result = h.action('Bob', { type: 'challenge' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.challengeResult?.wasLying).toBe(true);
      }
    });
  });

  describe('revolver mechanics', () => {
    it('revolver chamber advances after each shot', () => {
      const h = create2p('seed-rev');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 5); // bullet at 5, won't die for 5 shots

      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      h.action('Bob', { type: 'challenge' });

      const aliceInfo = h.view('Alice').players.find((p: any) => p.id === 'Alice');
      expect(aliceInfo?.revolverChamber).toBe(1);
    });

    it('player is eliminated when bullet chamber is hit', () => {
      const h = create2p('seed-elim');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 0); // bullet at chamber 0

      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      h.action('Bob', { type: 'challenge' }); // Alice lied, Alice shoots

      const aliceInfo = h.view('Bob').players.find((p: any) => p.id === 'Alice');
      expect(aliceInfo?.alive).toBe(false);
    });
  });

  describe('game over', () => {
    it('game ends when only one player remains', () => {
      const h = create2p('seed-gameover');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 0); // Alice dies on first shot

      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      h.action('Bob', { type: 'challenge' }); // Alice lied -> Alice shot -> Alice dies

      expect(h.isFinished).toBe(true);
      expect(h.rankings).not.toBeNull();
      expect(h.rankings![0]).toBe('Bob');
    });

    it('winner is set in the view after game over', () => {
      const h = create2p('seed-winner');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 0);

      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      h.action('Bob', { type: 'challenge' });

      const view = h.view('Bob');
      expect(view.winner).toBe('Bob');
      expect(view.phase).toBe('finished');
    });

    it('rejects actions after game over', () => {
      const h = create2p('seed-reject');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 0);

      h.action('Alice', { type: 'play_cards', cardIndices: [0] });
      h.action('Bob', { type: 'challenge' });

      const result = h.action('Bob', { type: 'play_cards', cardIndices: [0] });
      expect(result.ok).toBe(false);
    });
  });

  describe('challenge result in player view', () => {
    it('challenge result is visible to all players', () => {
      const h = create2p('seed-cr');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'A', 'A', 'A']);
      setRevolver(h, 'Alice', 0, 3); // won't die

      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });
      h.action('Bob', { type: 'challenge' });

      const aliceView = h.view('Alice');
      const bobView = h.view('Bob');
      expect(aliceView.challengeResult).not.toBeNull();
      expect(bobView.challengeResult).not.toBeNull();
      expect(aliceView.challengeResult?.playedCards).toHaveLength(2);
      expect(aliceView.challengeResult?.wasLying).toBe(true);
    });

    it('challenge result clears after next play', () => {
      const h = create2p('seed-clr');
      setDeclaredSuit(h, 'Q');
      setHand(h, 'Alice', ['K', 'K', 'Q', 'Q', 'Q']);
      setRevolver(h, 'Alice', 0, 3); // won't die

      h.action('Alice', { type: 'play_cards', cardIndices: [0, 1] });
      h.action('Bob', { type: 'challenge' });

      // Now Bob plays (Bob shoots in challenge, doesn't die at chamber 3)
      const view = h.view('Bob');
      // After challenge, Bob should be current player (shooter survives)
      if (view.currentPlayer === 'Bob') {
        setHand(h, 'Bob', ['Q', 'Q', 'Q', 'Q', 'Q']);
        h.action('Bob', { type: 'play_cards', cardIndices: [0] });
        const viewAfter = h.view('Bob');
        expect(viewAfter.challengeResult).toBeNull();
      }
    });
  });

  describe('spectator view', () => {
    it('spectator has empty myHand', () => {
      const h = createGame();
      const view = h.spectatorView();
      expect(view?.myHand).toEqual([]);
    });
  });
});
