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
