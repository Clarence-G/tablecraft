import type { EngineEvent } from '@repo/shared';
import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView } from './shared';
import { renderPlayLogEffect } from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(players = ['Alice', 'Bob', 'Carol', 'Diana'], seed = 'test') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

function create2p(seed = 'test-2p') {
  return createGame(['Alice', 'Bob'], seed);
}

/** Force a specific hand for testing by mutating rawState */
function setHand(h: Harness, playerId: string, cards: number[]) {
  (h.rawState as any).hands[playerId] = cards;
}

function setDeck(h: Harness, cards: number[]) {
  (h.rawState as any).deck = cards;
}

function setCurrentPlayer(h: Harness, playerId: string) {
  const players = (h.rawState as any).players as string[];
  (h.rawState as any).currentPlayerIndex = players.indexOf(playerId);
}

function setProtected(h: Harness, playerId: string, value: boolean) {
  (h.rawState as any).protected[playerId] = value;
}

function setAlive(h: Harness, playerId: string, value: boolean) {
  (h.rawState as any).alive[playerId] = value;
  if (!value) {
    (h.rawState as any).hands[playerId] = [];
  }
}

describe('Love Letter Logic', () => {
  describe('setup', () => {
    it('deals cards correctly for 4 players', () => {
      const h = createGame();
      const state = h.rawState;
      // 16 cards total - 1 set aside - 4 dealt - 1 extra for first player = 10 in deck
      expect(state.deck.length).toBe(10);
      expect(state.setAsideCard).toBeGreaterThanOrEqual(1);
      // First player has 2 cards (already drew)
      expect(state.hands.Alice.length).toBe(2);
      // Others have 1
      expect(state.hands.Bob.length).toBe(1);
      expect(state.hands.Carol.length).toBe(1);
      expect(state.hands.Diana.length).toBe(1);
    });

    it('2-player variant removes 3 extra cards face-up', () => {
      const h = create2p();
      const state = h.rawState;
      expect(state.removedCards.length).toBe(3);
      // 16 - 1 set aside - 3 removed - 2 dealt - 1 extra draw = 9 in deck
      expect(state.deck.length).toBe(9);
    });

    it('all players start alive and unprotected', () => {
      const h = createGame();
      const state = h.rawState;
      for (const pid of ['Alice', 'Bob', 'Carol', 'Diana']) {
        expect(state.alive[pid]).toBe(true);
        expect(state.protected[pid]).toBe(false);
      }
    });

    it('first player goes first', () => {
      const h = createGame();
      expect(h.view('Alice').currentPlayer).toBe('Alice');
    });

    it('removed cards visible in 2-player view', () => {
      const h = create2p();
      const view = h.view('Alice');
      expect(view.removedCards.length).toBe(3);
    });
  });

  describe('basic turn flow', () => {
    it('rejects action from wrong player', () => {
      const h = createGame();
      setHand(h, 'Bob', [4]);
      const result = h.action('Bob', { type: 'play_card', card: 4 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('还没轮到你');
    });

    it('rejects playing a card not in hand', () => {
      const h = createGame();
      const result = h.action('Alice', { type: 'play_card', card: 8 });
      // Might fail if Alice happens to have an 8, so set hand explicitly
      setHand(h, 'Alice', [1, 3]);
      const result2 = h.action('Alice', { type: 'play_card', card: 8 });
      expect(result2.ok).toBe(false);
      if (!result2.ok) expect(result2.reason).toBe('你没有这张牌');
    });

    it('advances to next player after playing', () => {
      const h = createGame();
      setHand(h, 'Alice', [4, 1]);
      setDeck(h, [3, 2, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      expect(h.view('Bob').currentPlayer).toBe('Bob');
    });

    it('next player draws a card (has 2 cards)', () => {
      const h = createGame();
      setHand(h, 'Alice', [4, 1]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [5, 2, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      // Bob should now have 2 cards
      expect(h.view('Bob').hand.length).toBe(2);
    });

    it('skips eliminated players', () => {
      const h = createGame();
      setAlive(h, 'Bob', false);
      setHand(h, 'Alice', [4, 1]);
      setDeck(h, [3, 2, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      expect(h.view('Carol').currentPlayer).toBe('Carol');
    });
  });

  describe('Guard (1)', () => {
    it('correct guess eliminates target', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 1,
        target: 'Bob',
        guess: 3,
      });
      expect(result.ok).toBe(true);
      const view = h.view('Alice');
      const bob = view.players.find((p) => p.id === 'Bob')!;
      expect(bob.alive).toBe(false);
    });

    it('wrong guess has no effect', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 1,
        target: 'Bob',
        guess: 5,
      });
      expect(result.ok).toBe(true);
      const view = h.view('Alice');
      const bob = view.players.find((p) => p.id === 'Bob')!;
      expect(bob.alive).toBe(true);
    });

    it('cannot target protected player', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      setProtected(h, 'Bob', true);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 1,
        target: 'Bob',
        guess: 3,
      });
      expect(result.ok).toBe(false);
    });

    it('plays with no effect when all others protected', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      setProtected(h, 'Bob', true);
      setProtected(h, 'Carol', true);
      setProtected(h, 'Diana', true);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      const result = h.action('Alice', { type: 'play_card', card: 1 });
      expect(result.ok).toBe(true);
    });

    it('requires guess when targeting', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 1,
        target: 'Bob',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('Priest (2)', () => {
    it('produces NOTIFY with target card', () => {
      const h = createGame();
      setHand(h, 'Alice', [2, 4]);
      setHand(h, 'Bob', [6]);
      setDeck(h, [3, 1, 1, 1, 1, 1]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 2,
        target: 'Bob',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const notify = result.events?.find((e) => e.type === 'NOTIFY' && (e as any).to === 'Alice');
        expect(notify).toBeDefined();
        expect((notify as any).payload).toEqual({
          type: 'priest_peek',
          target: 'Bob',
          card: 6,
        });
      }
    });

    it('does not expose card in player view', () => {
      const h = createGame();
      setHand(h, 'Alice', [2, 4]);
      setHand(h, 'Bob', [6]);
      setDeck(h, [3, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 2, target: 'Bob' });
      const aliceView = h.view('Alice');
      // Alice's view should not contain Bob's hand value
      const bobInfo = aliceView.players.find((p) => p.id === 'Bob')!;
      // Only cardCount is visible, not actual card values
      expect(bobInfo.cardCount).toBeGreaterThanOrEqual(0);
      // Verify the hand field only contains Alice's own cards
      expect(aliceView.hand).not.toContain(6);
    });
  });

  describe('Baron (3)', () => {
    it('higher card wins, target eliminated', () => {
      const h = createGame();
      setHand(h, 'Alice', [3, 5]);
      setHand(h, 'Bob', [2]);
      setDeck(h, [1, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 3, target: 'Bob' });
      const view = h.view('Alice');
      expect(view.players.find((p) => p.id === 'Bob')?.alive).toBe(false);
    });

    it('lower card loses, player eliminated', () => {
      const h = createGame();
      setHand(h, 'Alice', [3, 1]);
      setHand(h, 'Bob', [5]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 3, target: 'Bob' });
      const view = h.view('Bob');
      expect(view.players.find((p) => p.id === 'Alice')?.alive).toBe(false);
    });

    it('tie results in no elimination', () => {
      const h = createGame();
      setHand(h, 'Alice', [3, 4]);
      setHand(h, 'Bob', [4]);
      setDeck(h, [1, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 3, target: 'Bob' });
      const view = h.view('Alice');
      expect(view.players.find((p) => p.id === 'Alice')?.alive).toBe(true);
      expect(view.players.find((p) => p.id === 'Bob')?.alive).toBe(true);
    });
  });

  describe('Handmaid (4)', () => {
    it('sets player as protected', () => {
      const h = createGame();
      setHand(h, 'Alice', [4, 1]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      const view = h.view('Bob');
      expect(view.players.find((p) => p.id === 'Alice')?.protected).toBe(true);
    });

    it('protection clears at start of own next turn', () => {
      const h = createGame(['Alice', 'Bob'], 'handmaid-clear');
      setHand(h, 'Alice', [4, 1]);
      setHand(h, 'Bob', [4]);
      setDeck(h, [1, 2, 1, 1, 1, 1, 1, 1]);

      // Alice plays Handmaid
      h.action('Alice', { type: 'play_card', card: 4 });
      expect(h.view('Bob').players.find((p) => p.id === 'Alice')?.protected).toBe(true);

      // Bob plays Handmaid
      h.action('Bob', { type: 'play_card', card: 4 });

      // Now it's Alice's turn again — protection should be cleared
      expect(h.view('Alice').players.find((p) => p.id === 'Alice')?.protected).toBe(false);
    });
  });

  describe('Prince (5)', () => {
    it('forces target to discard and redraw', () => {
      const h = createGame();
      setHand(h, 'Alice', [5, 1]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [6, 2, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 5, target: 'Bob' });
      const view = h.view('Bob');
      // Bob should have drawn a new card (6 was on top of deck)
      expect(view.players.find((p) => p.id === 'Bob')?.alive).toBe(true);
      // Bob's old card (3) should be in their played pile
      expect(view.players.find((p) => p.id === 'Bob')?.playedCards).toContain(3);
    });

    it('discarding Princess eliminates target', () => {
      const h = createGame();
      setHand(h, 'Alice', [5, 1]);
      setHand(h, 'Bob', [8]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 5, target: 'Bob' });
      const view = h.view('Alice');
      expect(view.players.find((p) => p.id === 'Bob')?.alive).toBe(false);
    });

    it('can target self', () => {
      const h = createGame();
      setHand(h, 'Alice', [5, 1]);
      setDeck(h, [6, 2, 1, 1, 1, 1]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 5,
        target: 'Alice',
      });
      expect(result.ok).toBe(true);
    });

    it('draws set-aside card when deck is empty', () => {
      const h = createGame();
      setHand(h, 'Alice', [5, 1]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [2]); // Only 1 card left — will be drawn by next player, leaving 0 for Prince
      // Actually, let's handle this more carefully:
      // We need the deck to be empty when Prince resolves
      setDeck(h, []); // Empty deck
      (h.rawState as any).setAsideCard = 4;
      h.action('Alice', { type: 'play_card', card: 5, target: 'Bob' });
      // Bob should have gotten the set-aside card
      const bobHand = (h.rawState as any).hands.Bob;
      expect(bobHand).toContain(4);
    });
  });

  describe('King (6)', () => {
    it('swaps hands with target', () => {
      const h = createGame();
      setHand(h, 'Alice', [6, 1]);
      setHand(h, 'Bob', [8]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 6, target: 'Bob' });
      // Alice's remaining card was 1, Bob's was 8
      // After swap: Alice has [8], Bob has [1]
      const aliceView = h.view('Alice');
      expect(aliceView.hand).toEqual([8]);
      const bobState = (h.rawState as any).hands.Bob;
      // Bob drew a card for the new turn, so should have [1, drawn_card]
      expect(bobState[0]).toBe(1);
    });
  });

  describe('Countess (7)', () => {
    it('must play countess when holding King', () => {
      const h = createGame();
      setHand(h, 'Alice', [7, 6]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 6,
        target: 'Bob',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('伯爵夫人');
      }
    });

    it('must play countess when holding Prince', () => {
      const h = createGame();
      setHand(h, 'Alice', [7, 5]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 5,
        target: 'Bob',
      });
      expect(result.ok).toBe(false);
    });

    it('can play countess voluntarily without King/Prince', () => {
      const h = createGame();
      setHand(h, 'Alice', [7, 3]);
      setDeck(h, [1, 2, 1, 1, 1, 1]);
      const result = h.action('Alice', { type: 'play_card', card: 7 });
      expect(result.ok).toBe(true);
    });

    it('playing countess when forced is accepted', () => {
      const h = createGame();
      setHand(h, 'Alice', [7, 6]);
      setDeck(h, [1, 2, 1, 1, 1, 1]);
      const result = h.action('Alice', { type: 'play_card', card: 7 });
      expect(result.ok).toBe(true);
    });
  });

  describe('Princess (8)', () => {
    it('playing princess eliminates the player', () => {
      const h = createGame();
      setHand(h, 'Alice', [8, 1]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 8 });
      const view = h.view('Bob');
      expect(view.players.find((p) => p.id === 'Alice')?.alive).toBe(false);
    });
  });

  describe('win conditions', () => {
    it('last player standing wins', () => {
      const h = createGame(['Alice', 'Bob'], 'win-last');
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [1, 1, 1, 1, 1]);
      // Alice correctly guesses Bob's card
      h.action('Alice', { type: 'play_card', card: 1, target: 'Bob', guess: 3 });
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('deck empty triggers hand comparison', () => {
      const h = createGame(['Alice', 'Bob'], 'win-compare');
      setHand(h, 'Alice', [7, 1]);
      setHand(h, 'Bob', [3]);
      setDeck(h, []); // Empty deck
      // Alice plays Guard (no one will be eliminated)
      h.action('Alice', { type: 'play_card', card: 1, target: 'Bob', guess: 5 });
      // Deck was empty, should trigger comparison
      expect(h.isFinished).toBe(true);
      // Alice has 7, Bob has 3 — Alice wins
      expect(h.rankings?.[0]).toBe('Alice');
    });

    it('highest card wins when deck empty', () => {
      const h = createGame(['Alice', 'Bob'], 'win-highest');
      setHand(h, 'Alice', [4, 2]);
      setHand(h, 'Bob', [6]);
      setDeck(h, []);
      h.action('Alice', { type: 'play_card', card: 4 });
      expect(h.isFinished).toBe(true);
      // Bob has 6, Alice has 2 — Bob wins
      expect(h.rankings?.[0]).toBe('Bob');
    });
  });

  describe('view privacy', () => {
    it('player can only see own hand', () => {
      const h = createGame();
      setHand(h, 'Alice', [3, 5]);
      setHand(h, 'Bob', [8]);
      const aliceView = h.view('Alice');
      expect(aliceView.hand).toEqual([3, 5]);
      const bobView = h.view('Bob');
      expect(bobView.hand).toEqual([8]);
      // Alice cannot see Bob's 8
      expect(aliceView.hand).not.toContain(8);
    });

    it('spectator sees no hands', () => {
      const h = createGame();
      const spec = h.spectatorView()!;
      expect(spec.hand).toEqual([]);
    });

    it('played cards are public', () => {
      const h = createGame();
      setHand(h, 'Alice', [4, 1]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      const bobView = h.view('Bob');
      const aliceInfo = bobView.players.find((p) => p.id === 'Alice')!;
      expect(aliceInfo.playedCards).toContain(4);
    });

    it('set-aside card value is hidden', () => {
      const h = createGame();
      const view = h.view('Alice');
      // PlayerView has no setAsideCard value field
      expect((view as any).setAsideCard).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('rejects action after game over', () => {
      const h = createGame(['Alice', 'Bob'], 'edge-over');
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [1, 1]);
      h.action('Alice', { type: 'play_card', card: 1, target: 'Bob', guess: 3 });
      expect(h.isFinished).toBe(true);
      // Try to act after game over
      const result = h.action('Alice', { type: 'play_card', card: 4 });
      expect(result.ok).toBe(false);
    });

    it('cannot target self with Guard', () => {
      const h = createGame();
      setHand(h, 'Alice', [1, 4]);
      const result = h.action('Alice', {
        type: 'play_card',
        card: 1,
        target: 'Alice',
        guess: 4,
      });
      expect(result.ok).toBe(false);
    });

    it('Prince on self discarding Princess eliminates self', () => {
      const h = createGame();
      setHand(h, 'Alice', [5, 8]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      // Alice must play 5 (can't play 8-Princess voluntarily... well she can, but let's test Prince)
      h.action('Alice', { type: 'play_card', card: 5, target: 'Alice' });
      const view = h.view('Bob');
      expect(view.players.find((p) => p.id === 'Alice')?.alive).toBe(false);
    });
  });

  describe('activity log', () => {
    it('emits log.playCard NOTIFY_ALL when a card is played', () => {
      const h = createGame();
      setHand(h, 'Alice', [4, 1]);
      setDeck(h, [2, 1, 1, 1, 1, 1]);
      h.action('Alice', { type: 'play_card', card: 4 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.playCard',
        actorId: 'Alice',
        kind: 'action',
      });
    });

    it('emits log.win NOTIFY_ALL when last player stands', () => {
      const h = createGame(['Alice', 'Bob'], 'log-win');
      setHand(h, 'Alice', [1, 4]);
      setHand(h, 'Bob', [3]);
      setDeck(h, [1, 1]);
      h.action('Alice', { type: 'play_card', card: 1, target: 'Bob', guess: 3 });
      const notify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.win',
      );
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.win',
        actorId: 'Alice',
      });
    });
  });

  describe('renderPlayLogEffect', () => {
    it('replaces raw player IDs in effect strings with nicknames', () => {
      const names = {
        'alice-uuid-123': 'Alice',
        'bob-uuid-456': 'Bob',
      };
      const input = '猜测 bob-uuid-456 持有公主(8)，猜对了！';
      expect(renderPlayLogEffect(input, names)).toBe('猜测 Bob 持有公主(8)，猜对了！');
    });

    it('falls back to the raw ID when a nickname is missing', () => {
      const input = '与 alice-uuid-123 比较手牌，平局';
      expect(renderPlayLogEffect(input, {})).toBe('与 alice-uuid-123 比较手牌，平局');
    });

    it('handles multiple IDs in one string and ID-is-substring-of-ID safely', () => {
      const names = { alice: 'Alice', 'alice-2': 'Alice2' };
      const input = '与 alice-2 交换了手牌；猜测 alice 持有公主(8)';
      // Longest ID replaced first — alice-2 -> Alice2 without corrupting the
      // standalone alice occurrence.
      expect(renderPlayLogEffect(input, names)).toBe(
        '与 Alice2 交换了手牌；猜测 Alice 持有公主(8)',
      );
    });
  });
});
