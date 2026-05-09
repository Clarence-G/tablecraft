import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import type { Action, PlayerView } from './shared';
import { deserializeCard, getCardAriaLabel } from './shared';
import {
  UNO_FAN_MD,
  UNO_FAN_MD_MOBILE,
  computeUnoFanDimensions,
  computeUnoFanSlot,
  detectSkippedPlayer,
} from './shared';

type Harness = GameTestHarness<any, Action, PlayerView>;

function createGame(players = ['Alice', 'Bob', 'Carol'], seed = 'test-uno') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

function create2p(seed = 'test-2p-uno') {
  return createGame(['Alice', 'Bob'], seed);
}

function getCurrentPlayer(h: Harness): string {
  return (h.rawState as any).currentPlayerIdx === 0
    ? h.players[0]
    : h.players[(h.rawState as any).currentPlayerIdx];
}

function setHand(h: Harness, playerId: string, cards: string[]) {
  (h.rawState as any).hands[playerId] = cards;
}

function setCurrentPlayerIdx(h: Harness, idx: number) {
  (h.rawState as any).currentPlayerIdx = idx;
}

function setTopCard(h: Harness, card: string, activeColor?: string) {
  const state = h.rawState as any;
  state.discardPile = [card];
  if (activeColor) {
    state.activeColor = activeColor;
  } else if (card !== 'wild' && card !== 'wild_draw_four') {
    const c = deserializeCard(card);
    if (c.type !== 'wild') state.activeColor = c.color;
  }
}

describe('UNO Logic', () => {
  describe('setup', () => {
    it('deals correct hand sizes to all players', () => {
      const h = createGame(['Alice', 'Bob', 'Carol']);
      const state = h.rawState as any;
      for (const pid of ['Alice', 'Bob', 'Carol']) {
        expect(state.hands[pid].length).toBe(7);
      }
    });

    it('starts with a non-empty discard pile', () => {
      const h = create2p();
      const state = h.rawState as any;
      expect(state.discardPile.length).toBeGreaterThan(0);
    });

    it('starts in playing phase', () => {
      const h = create2p();
      expect((h.rawState as any).phase).toBe('playing');
    });

    it('starts with a valid active color', () => {
      const h = create2p();
      const colors = ['red', 'blue', 'green', 'yellow'];
      expect(colors).toContain((h.rawState as any).activeColor);
    });
  });

  describe('play_card', () => {
    it('plays a matching color card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_3', 'blue_7', 'green_2']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.hands.Alice.length).toBe(2);
        expect(result.state.discardPile[result.state.discardPile.length - 1]).toBe('red_3');
      }
    });

    it('plays a matching value card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['blue_5', 'green_2']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
    });

    it('rejects non-playable card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['blue_7', 'green_2']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(false);
    });

    it('rejects action from wrong player', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      const result = h.action('Bob', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(false);
    });

    it('plays a wild card with chosen color', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild', 'blue_7']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'green' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.activeColor).toBe('green');
      }
    });

    it('requires chosenColor for wild card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild', 'blue_7']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(false);
    });
  });

  describe('draw_card', () => {
    it('draws a card and sets hasDrawnThisTurn', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      const initialCount = (h.rawState as any).hands.Alice.length;

      const result = h.action('Alice', { type: 'draw_card' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.hands.Alice.length).toBe(initialCount + 1);
        expect(result.state.hasDrawnThisTurn).toBe(true);
      }
    });

    it('cannot draw twice in one turn', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      h.action('Alice', { type: 'draw_card' });
      const result = h.action('Alice', { type: 'draw_card' });
      expect(result.ok).toBe(false);
    });
  });

  describe('pass', () => {
    it('can pass after drawing', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      // Force hand to have no playable cards
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['blue_7', 'green_3']);
      h.action('Alice', { type: 'draw_card' });
      const result = h.action('Alice', { type: 'pass' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.currentPlayerIdx).toBe(1);
      }
    });

    it('cannot pass without drawing first', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      const result = h.action('Alice', { type: 'pass' });
      expect(result.ok).toBe(false);
    });
  });

  describe('win condition', () => {
    it('ends game when a player plays their last card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_3']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.phase).toBe('finished');
        expect(result.state.winner).toBe('Alice');
      }
      expect(h.isFinished).toBe(true);
      expect(h.rankings?.[0]).toBe('Alice');
    });
  });

  describe('activity log', () => {
    it('emits log.play NOTIFY_ALL when playing a card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_3', 'blue_7']);
      h.action('Alice', { type: 'play_card', cardIndex: 0 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.play',
        actorId: 'Alice',
      });
    });

    it('emits log.draw NOTIFY_ALL when drawing a card', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      h.action('Alice', { type: 'draw_card' });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.draw',
        actorId: 'Alice',
      });
    });

    it('emits log.win NOTIFY_ALL when a player wins', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_3']);
      h.action('Alice', { type: 'play_card', cardIndex: 0 });
      const notifyAll = h.lastEvents.filter((e) => e.type === 'NOTIFY_ALL');
      const winNotify = notifyAll.find((e) => (e as any).payload?.messageKey === 'log.win');
      expect((winNotify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.win',
        actorId: 'Alice',
      });
    });

    it('emits log.skip NOTIFY_ALL when skip card played', () => {
      const h = createGame(['Alice', 'Bob', 'Carol']);
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_skip', 'blue_3']);
      h.action('Alice', { type: 'play_card', cardIndex: 0 });
      const skipNotify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.skip',
      );
      expect((skipNotify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.skip',
        actorId: 'Bob',
      });
    });

    it('emits log.drawMany NOTIFY_ALL when draw_two played', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_draw_two', 'blue_3']);
      h.action('Alice', { type: 'play_card', cardIndex: 0 });
      const drawNotify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.drawMany',
      );
      expect((drawNotify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.drawMany',
        actorId: 'Bob',
        messageParams: { count: 2 },
      });
    });
  });

  describe('card effects', () => {
    it('skip causes next player to be skipped', () => {
      const h = createGame(['Alice', 'Bob', 'Carol']);
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_skip', 'blue_3']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should skip Bob, go to Carol (index 2)
        expect(result.state.currentPlayerIdx).toBe(2);
      }
    });

    it('draw_two gives next player 2 cards', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_draw_two', 'blue_3']);
      const bobInitial = (h.rawState as any).hands.Bob.length;

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.hands.Bob.length).toBe(bobInitial + 2);
      }
    });

    it('reverse flips direction in 3+ player game', () => {
      const h = createGame(['Alice', 'Bob', 'Carol']);
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['red_reverse', 'blue_3']);

      const result = h.action('Alice', { type: 'play_card', cardIndex: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.direction).toBe(-1);
      }
    });
  });

  describe('wild_draw_four challenge', () => {
    it('opens a challenge window on +4 — no draw/skip yet, SET_TIMER emitted', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);
      const bobBefore = (h.rawState as any).hands.Bob.length;

      const result = h.action('Alice', {
        type: 'play_card',
        cardIndex: 0,
        chosenColor: 'green',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.awaitingChallenge).toEqual({
        challenger: 'Bob',
        playedBy: 'Alice',
        playedByHadMatchingColor: false,
      });
      // Bob has not drawn, turn has not advanced past Alice.
      expect(result.state.hands.Bob.length).toBe(bobBefore);
      expect(result.state.currentPlayerIdx).toBe(0);
      expect(result.state.activeColor).toBe('green');
      const timer = result.events?.find((e) => e.type === 'SET_TIMER');
      expect(timer).toMatchObject({ type: 'SET_TIMER', name: 'uno-challenge', ms: 10000 });
    });

    it('public view strips playedByHadMatchingColor', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'red_3']);
      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'blue' });

      for (const viewer of ['Alice', 'Bob'] as const) {
        const view = h.view(viewer);
        expect(view.awaitingChallenge).toEqual({ challenger: 'Bob', playedBy: 'Alice' });
      }
    });

    it('challenge succeeds when playedBy had a matching color — playedBy draws 4, challenger plays next', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      // Alice cheats: she held red_3 but played the +4
      setHand(h, 'Alice', ['wild_draw_four', 'red_3']);
      const aliceBefore = (h.rawState as any).hands.Alice.length; // 2
      const bobBefore = (h.rawState as any).hands.Bob.length;

      const play = h.action('Alice', {
        type: 'play_card',
        cardIndex: 0,
        chosenColor: 'blue',
      });
      expect(play.ok).toBe(true);

      const result = h.action('Bob', { type: 'challenge_draw_four' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Alice drew 4 (lost 1 card to play, so aliceBefore - 1 + 4)
      expect(result.state.hands.Alice.length).toBe(aliceBefore - 1 + 4);
      // Bob untouched
      expect(result.state.hands.Bob.length).toBe(bobBefore);
      // Turn now at Bob (challenger plays)
      expect(result.state.currentPlayerIdx).toBe(1);
      expect(result.state.awaitingChallenge).toBeNull();
      expect(result.events?.some((e) => e.type === 'CLEAR_TIMER')).toBe(true);
      // Challenge reveal captures hand at time of play (before the draw-4 penalty)
      expect(result.state.lastChallengeReveal).toEqual({
        playedBy: 'Alice',
        revealedHand: ['red_3'],
        hadMatchingColor: true,
      });
    });

    it('challenge fails when playedBy had no matching color — challenger draws 6 and is skipped', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      // Alice only has wilds + off-color — playing +4 was legal
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);
      const bobBefore = (h.rawState as any).hands.Bob.length;

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'yellow' });
      const result = h.action('Bob', { type: 'challenge_draw_four' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.hands.Bob.length).toBe(bobBefore + 6);
      expect(result.state.awaitingChallenge).toBeNull();
      // 2-player: skipping Bob wraps back to Alice
      expect(result.state.currentPlayerIdx).toBe(0);
    });

    it('accept_draw_four draws 4 for challenger and skips them', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);
      const bobBefore = (h.rawState as any).hands.Bob.length;

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'green' });
      const result = h.action('Bob', { type: 'accept_draw_four' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.hands.Bob.length).toBe(bobBefore + 4);
      expect(result.state.awaitingChallenge).toBeNull();
      expect(result.state.currentPlayerIdx).toBe(0);
    });

    it('timer auto-accepts: challenger draws 4 and is skipped', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);
      const bobBefore = (h.rawState as any).hands.Bob.length;

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'red' });
      const result = h.timer('uno-challenge');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.hands.Bob.length).toBe(bobBefore + 4);
      expect(result.state.awaitingChallenge).toBeNull();
      expect(result.state.currentPlayerIdx).toBe(0);
    });

    it('only the challenger can challenge/accept — other actions rejected while pending', () => {
      const h = createGame(['Alice', 'Bob', 'Carol']);
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);
      setHand(h, 'Carol', ['red_3']);

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'red' });
      const byCarol = h.action('Carol', { type: 'challenge_draw_four' });
      expect(byCarol.ok).toBe(false);
      const normalPlay = h.action('Bob', { type: 'play_card', cardIndex: 0 });
      expect(normalPlay.ok).toBe(false);
    });

    it('failed challenge records lastChallengeReveal with hadMatchingColor=false', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'yellow' });
      const result = h.action('Bob', { type: 'challenge_draw_four' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.lastChallengeReveal).toEqual({
        playedBy: 'Alice',
        revealedHand: ['blue_3'],
        hadMatchingColor: false,
      });
    });

    it('accept_draw_four does NOT set lastChallengeReveal (only actual challenges reveal)', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'blue_3']);

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'green' });
      const result = h.action('Bob', { type: 'accept_draw_four' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.lastChallengeReveal).toBeNull();
    });

    it('lastChallengeReveal is cleared on the next normal action', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'red_3']);

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'blue' });
      const challenge = h.action('Bob', { type: 'challenge_draw_four' });
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;
      expect(challenge.state.lastChallengeReveal).not.toBeNull();

      // Bob's turn now — drawing clears the reveal
      const next = h.action('Bob', { type: 'draw_card' });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      expect(next.state.lastChallengeReveal).toBeNull();
    });

    it('lastChallengeReveal is exposed on every player view after a successful challenge', () => {
      const h = create2p();
      setCurrentPlayerIdx(h, 0);
      setTopCard(h, 'red_5', 'red');
      setHand(h, 'Alice', ['wild_draw_four', 'red_3']);

      h.action('Alice', { type: 'play_card', cardIndex: 0, chosenColor: 'blue' });
      h.action('Bob', { type: 'challenge_draw_four' });

      for (const viewer of ['Alice', 'Bob'] as const) {
        const view = h.view(viewer);
        expect(view.lastChallengeReveal).toEqual({
          playedBy: 'Alice',
          revealedHand: ['red_3'],
          hadMatchingColor: true,
        });
      }
    });
  });
});

// ---- Aria label tests ----

// Minimal mock matching the zh locale (avoids importing the full i18n stack)
function mockT(key: string, params?: Record<string, string>): string {
  const map: Record<string, string> = {
    'color.red': '红色',
    'color.blue': '蓝色',
    'color.green': '绿色',
    'color.yellow': '黄色',
    'a11y.wild': '变色牌',
    'a11y.wildDrawFour': '变色牌 +4',
    'a11y.wildWithColor': '变色牌（当前{{color}}）',
    'a11y.wildDrawFourWithColor': '变色牌 +4（当前{{color}}）',
  };
  let result = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{{${k}}}`, v);
    }
  }
  return result;
}

describe('getCardAriaLabel', () => {
  it('colored cards include the color name', () => {
    expect(getCardAriaLabel('red_8', mockT)).toBe('红色 8');
    expect(getCardAriaLabel('blue_skip', mockT)).toBe('蓝色 SKIP');
    expect(getCardAriaLabel('green_reverse', mockT)).toBe('绿色 REVERSE');
    expect(getCardAriaLabel('yellow_draw_two', mockT)).toBe('黄色 +2');
  });

  it('wild hand cards carry the wild label without active color', () => {
    expect(getCardAriaLabel('wild', mockT)).toBe('变色牌');
    expect(getCardAriaLabel('wild_draw_four', mockT)).toBe('变色牌 +4');
  });

  it('wild on discard pile includes the active color', () => {
    expect(getCardAriaLabel('wild', mockT, 'red')).toBe('变色牌（当前红色）');
    expect(getCardAriaLabel('wild_draw_four', mockT, 'blue')).toBe('变色牌 +4（当前蓝色）');
  });

  it('every colored hand card label matches a color word', () => {
    const cards = [
      'red_5',
      'blue_skip',
      'green_reverse',
      'yellow_draw_two',
      'wild',
      'wild_draw_four',
    ];
    for (const card of cards) {
      const label = getCardAriaLabel(card, mockT);
      expect(label).toMatch(/红色|蓝色|绿色|黄色|变色牌/);
    }
  });
});

describe('UNO hand fan layout', () => {
  it('empty or single hand centers a single slot with zero offset', () => {
    expect(computeUnoFanSlot(0, 0)).toEqual({ rotate: 0, translateX: 0, translateY: 0 });
    expect(computeUnoFanSlot(0, 1)).toEqual({ rotate: 0, translateX: 0, translateY: 0 });
  });

  it('two-card hand mirrors slots across the center', () => {
    const left = computeUnoFanSlot(0, 2);
    const right = computeUnoFanSlot(1, 2);
    expect(left.translateX).toBe(-right.translateX);
    expect(left.rotate).toBe(-right.rotate);
    expect(left.translateY).toBe(right.translateY); // symmetric arc
  });

  it('the middle card in an odd-count hand stays centered', () => {
    const mid = computeUnoFanSlot(2, 5);
    expect(mid).toEqual({ rotate: 0, translateX: 0, translateY: 0 });
  });

  it('slots are purely a function of (index, count) and never depend on neighbors', () => {
    // The invariant underpinning the "only-hovered-card-translates" UX: a slot
    // transform for index 3 in a 7-card hand is identical every render.
    const snapshot = computeUnoFanSlot(3, 7);
    for (let i = 0; i < 5; i++) expect(computeUnoFanSlot(3, 7)).toEqual(snapshot);
  });

  it('hand dimensions grow with card count and include lift headroom', () => {
    const one = computeUnoFanDimensions(1);
    const seven = computeUnoFanDimensions(7);
    expect(seven.width).toBeGreaterThan(one.width);
    expect(seven.height).toBeGreaterThan(one.height);
    // Height always reserves vertical space for the selected-card lift so the
    // surrounding hand panel doesn't clip the lifted card.
    expect(one.height - UNO_FAN_MD.cardH).toBeGreaterThanOrEqual(UNO_FAN_MD.liftHeadroom);
  });

  it('mobile config spreads narrower than desktop config for the same count', () => {
    const desktop = computeUnoFanDimensions(7, UNO_FAN_MD);
    const mobile = computeUnoFanDimensions(7, UNO_FAN_MD_MOBILE);
    expect(mobile.width).toBeLessThan(desktop.width);
  });
});

describe('detectSkippedPlayer', () => {
  it('returns the skipped id when a seat is jumped over (cw)', () => {
    const order = ['A', 'B', 'C', 'D'];
    // A played skip → turn went from A straight to C, skipping B.
    expect(detectSkippedPlayer(order, 'A', 'C', 1)).toBe('B');
  });

  it('returns the skipped id when a seat is jumped over (ccw)', () => {
    const order = ['A', 'B', 'C', 'D'];
    // Direction is -1, so the "next" of A is D. A played skip → turn went
    // straight to C, skipping D.
    expect(detectSkippedPlayer(order, 'A', 'C', -1)).toBe('D');
  });

  it('returns null for a normal one-step turn', () => {
    expect(detectSkippedPlayer(['A', 'B', 'C'], 'A', 'B', 1)).toBeNull();
  });

  it('returns null with fewer than 3 players (no third party to skip)', () => {
    // Two-player skip cards just hand the turn back — no third player pulses.
    expect(detectSkippedPlayer(['A', 'B'], 'A', 'A', 1)).toBeNull();
  });

  it('returns null when fromId === toId', () => {
    expect(detectSkippedPlayer(['A', 'B', 'C'], 'A', 'A', 1)).toBeNull();
  });

  it('wraps around the seat order at the end of the list', () => {
    const order = ['A', 'B', 'C', 'D'];
    // C played skip cw → D would have been next; jump to A, skipping D.
    expect(detectSkippedPlayer(order, 'C', 'A', 1)).toBe('D');
  });
});
