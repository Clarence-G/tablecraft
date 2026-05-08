import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  COLORS,
  DRAW_TWO_COUNT,
  INITIAL_HAND_SIZE,
  type PlayerInfo,
  type PlayerView,
  type UnoCard,
  type UnoColor,
  WILD_DRAW_FOUR_COUNT,
  deserializeCard,
  serializeCard,
} from './shared';

// ---- Internal State ----

interface UnoState {
  hands: Record<string, string[]>;
  drawPile: string[];
  discardPile: string[];
  activeColor: UnoColor;
  direction: 1 | -1;
  currentPlayerIdx: number;
  phase: 'playing' | 'finished';
  winner: string | null;
  hasDrawnThisTurn: boolean;
  players: string[];
}

// ---- Pure helpers (use ctx.random instead of Math.random) ----

function createFullDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push({ type: 'number', color, value: 0 });
    for (let n = 1; n <= 9; n++) {
      deck.push({ type: 'number', color, value: n as any });
      deck.push({ type: 'number', color, value: n as any });
    }
    for (const action of ['skip', 'reverse', 'draw_two'] as const) {
      deck.push({ type: 'action', color, action });
      deck.push({ type: 'action', color, action });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ type: 'wild', color: 'wild', action: 'wild' });
    deck.push({ type: 'wild', color: 'wild', action: 'wild_draw_four' });
  }
  return deck;
}

function canPlayCard(card: UnoCard, topCard: UnoCard, activeColor: UnoColor): boolean {
  if (card.type === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value)
    return true;
  if (card.type === 'action' && topCard.type === 'action' && card.action === topCard.action)
    return true;
  return false;
}

function getNextPlayerIdx(
  current: number,
  direction: 1 | -1,
  playerCount: number,
  skip = 0,
): number {
  const steps = 1 + skip;
  return (((current + direction * steps) % playerCount) + playerCount) % playerCount;
}

function ensureDrawPile(state: UnoState, ctx: GameContext): UnoState {
  if (state.drawPile.length > 0) return state;
  if (state.discardPile.length <= 1) return state;
  const topCard = state.discardPile[state.discardPile.length - 1];
  const toReshuffle = state.discardPile.slice(0, -1);
  const shuffled = ctx.random.shuffle(toReshuffle);
  return {
    ...state,
    drawPile: shuffled,
    discardPile: topCard !== undefined ? [topCard] : [],
  };
}

function drawCards(state: UnoState, playerId: string, count: number, ctx: GameContext): UnoState {
  let s = state;
  const drawn: string[] = [];
  for (let i = 0; i < count; i++) {
    s = ensureDrawPile(s, ctx);
    if (s.drawPile.length === 0) break;
    const [card, ...rest] = s.drawPile;
    drawn.push(card ?? '');
    s = { ...s, drawPile: rest };
  }
  const validDrawn = drawn.filter((c) => c !== '');
  return {
    ...s,
    hands: {
      ...s.hands,
      [playerId]: [...(s.hands[playerId] ?? []), ...validDrawn],
    },
  };
}

export const logic: GameLogic<UnoState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): UnoState {
    const deck = ctx.random.shuffle(createFullDeck());
    const serialized = deck.map(serializeCard);

    // Deal hands
    const hands: Record<string, string[]> = {};
    let remaining = [...serialized];
    for (const pid of ctx.players) {
      hands[pid] = remaining.splice(0, INITIAL_HAND_SIZE);
    }

    // Draw first card (skip wild_draw_four)
    let firstCard: string | undefined;
    while (remaining.length > 0) {
      const candidate = remaining[0];
      if (candidate !== 'wild_draw_four') {
        firstCard = candidate;
        remaining = remaining.slice(1);
        break;
      }
      // Move wild_draw_four to end
      remaining = [...remaining.slice(1), remaining[0]];
    }

    const firstCardObj = firstCard !== undefined ? deserializeCard(firstCard) : undefined;

    // Determine active color
    let activeColor: UnoColor = COLORS[ctx.random.int(0, 3)];
    if (firstCardObj && firstCardObj.type !== 'wild') {
      activeColor = firstCardObj.color as UnoColor;
    }

    // Determine initial direction and first player skip
    let direction: 1 | -1 = 1;
    let currentPlayerIdx = 0;

    if (firstCardObj) {
      if (firstCardObj.type === 'action') {
        if (firstCardObj.action === 'reverse') {
          if (ctx.players.length === 2) {
            currentPlayerIdx = getNextPlayerIdx(0, 1, ctx.players.length, 1);
          } else {
            direction = -1;
          }
        } else if (firstCardObj.action === 'skip') {
          currentPlayerIdx = getNextPlayerIdx(0, direction, ctx.players.length, 1);
        } else if (firstCardObj.action === 'draw_two') {
          // First player draws 2, then skipped
          const firstPlayer = ctx.players[0];
          const drawPileTmp = [...remaining];
          const drawn: string[] = [];
          for (let i = 0; i < DRAW_TWO_COUNT; i++) {
            const c = drawPileTmp.shift();
            if (c !== undefined) drawn.push(c);
          }
          hands[firstPlayer] = [...(hands[firstPlayer] ?? []), ...drawn];
          remaining = drawPileTmp;
          currentPlayerIdx = getNextPlayerIdx(0, direction, ctx.players.length, 1);
        }
      }
    }

    return {
      hands,
      drawPile: remaining,
      discardPile: firstCard !== undefined ? [firstCard] : [],
      activeColor,
      direction,
      currentPlayerIdx,
      phase: 'playing',
      winner: null,
      hasDrawnThisTurn: false,
      players: ctx.players,
    };
  },

  onAction(state, action, playerID, ctx): ActionResult<UnoState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }

    const currentPlayer = state.players[state.currentPlayerIdx];
    if (playerID !== currentPlayer) {
      return { ok: false, reason: '还没轮到你' };
    }

    const events: EngineEvent[] = [];

    if (action.type === 'draw_card') {
      if (state.hasDrawnThisTurn) {
        return { ok: false, reason: '本回合已经摸过牌了' };
      }
      let s = drawCards(state, playerID, 1, ctx);
      s = { ...s, hasDrawnThisTurn: true };
      return { ok: true, state: s, events: [logAction(playerID, 'log.draw', { count: 1 })] };
    }

    if (action.type === 'pass') {
      if (!state.hasDrawnThisTurn) {
        return { ok: false, reason: '必须先摸牌才能跳过' };
      }
      const nextIdx = getNextPlayerIdx(
        state.currentPlayerIdx,
        state.direction,
        state.players.length,
      );
      const newState: UnoState = {
        ...state,
        currentPlayerIdx: nextIdx,
        hasDrawnThisTurn: false,
      };
      return { ok: true, state: newState, events: [logAction(playerID, 'log.pass')] };
    }

    // play_card
    const hand = state.hands[playerID] ?? [];
    if (action.cardIndex < 0 || action.cardIndex >= hand.length) {
      return { ok: false, reason: '无效的牌索引' };
    }

    const cardSerialized = hand[action.cardIndex];
    if (cardSerialized === undefined) {
      return { ok: false, reason: '无效的牌索引' };
    }
    const card = deserializeCard(cardSerialized);

    const topCardSerialized = state.discardPile[state.discardPile.length - 1];
    if (topCardSerialized === undefined) {
      return { ok: false, reason: '牌堆为空' };
    }
    const topCard = deserializeCard(topCardSerialized);

    if (!canPlayCard(card, topCard, state.activeColor)) {
      return { ok: false, reason: '不能出这张牌' };
    }

    // Wild card requires chosenColor
    if (card.type === 'wild' && !action.chosenColor) {
      return { ok: false, reason: '万能牌需要选择颜色' };
    }

    const playLog = logAction(playerID, 'log.play', { card: cardSerialized });

    // Remove card from hand
    const newHand = [...hand];
    newHand.splice(action.cardIndex, 1);

    let newState: UnoState = {
      ...state,
      hands: { ...state.hands, [playerID]: newHand },
      discardPile: [...state.discardPile, cardSerialized],
      hasDrawnThisTurn: false,
    };

    // Check win
    if (newHand.length === 0) {
      const rankings = [playerID, ...state.players.filter((p) => p !== playerID)];
      newState = { ...newState, phase: 'finished', winner: playerID };
      events.push(playLog, logSystem('log.win', { actorId: playerID }), {
        type: 'END_GAME',
        rankings,
      });
      return { ok: true, state: newState, events };
    }

    // Apply card effect
    let newDirection = state.direction;
    let newActiveColor: UnoColor = state.activeColor;
    let skipCount = 0;
    let drawCount = 0;

    if (card.type === 'number') {
      newActiveColor = card.color;
    } else if (card.type === 'action') {
      newActiveColor = card.color;
      if (card.action === 'skip') {
        skipCount = 1;
      } else if (card.action === 'reverse') {
        if (state.players.length === 2) {
          skipCount = 1;
        } else {
          newDirection = (state.direction * -1) as 1 | -1;
        }
      } else if (card.action === 'draw_two') {
        drawCount = DRAW_TWO_COUNT;
        skipCount = 1;
      }
    } else if (card.type === 'wild') {
      newActiveColor = action.chosenColor ?? state.activeColor;
      if (card.action === 'wild_draw_four') {
        drawCount = WILD_DRAW_FOUR_COUNT;
        skipCount = 1;
      }
    }

    // Draw target is the immediate next player
    const drawTargetIdx = getNextPlayerIdx(
      state.currentPlayerIdx,
      newDirection,
      state.players.length,
      0,
    );

    // Apply draw penalty
    if (drawCount > 0) {
      const drawTargetId = state.players[drawTargetIdx];
      if (drawTargetId !== undefined) {
        newState = drawCards(newState, drawTargetId, drawCount, ctx);
      }
    }

    // Next player after skips
    const nextIdx = getNextPlayerIdx(
      state.currentPlayerIdx,
      newDirection,
      state.players.length,
      skipCount,
    );

    newState = {
      ...newState,
      direction: newDirection,
      activeColor: newActiveColor,
      currentPlayerIdx: nextIdx,
    };

    events.push(playLog);
    if (card.type === 'wild') {
      events.push(logAction(playerID, 'log.wild', { color: newActiveColor }));
    }
    if (card.type === 'action' && card.action === 'reverse' && state.players.length > 2) {
      events.push(logSystem('log.reverse', {}));
    }
    if (drawCount > 0) {
      const targetId = state.players[drawTargetIdx];
      if (targetId !== undefined) {
        events.push(
          logSystem('log.drawMany', { actorId: targetId, messageParams: { count: drawCount } }),
        );
      }
    } else if (skipCount > 0) {
      const skippedId = state.players[drawTargetIdx];
      if (skippedId !== undefined) {
        events.push(logSystem('log.skip', { actorId: skippedId }));
      }
    }

    return { ok: true, state: newState, events };
  },

  getPlayerView(state, playerID): PlayerView {
    const topCardSerialized = state.discardPile[state.discardPile.length - 1] ?? '';
    const players: PlayerInfo[] = state.players.map((pid) => ({
      id: pid,
      cardCount: state.hands[pid]?.length ?? 0,
    }));
    return {
      myHand: state.hands[playerID] ?? [],
      topCard: topCardSerialized,
      activeColor: state.activeColor,
      drawPileCount: state.drawPile.length,
      players,
      currentPlayer: state.players[state.currentPlayerIdx] ?? '',
      direction: state.direction,
      phase: state.phase,
      winner: state.winner,
      hasDrawnThisTurn: state.hasDrawnThisTurn,
    };
  },

  getSpectatorView(state): PlayerView {
    const topCardSerialized = state.discardPile[state.discardPile.length - 1] ?? '';
    const players: PlayerInfo[] = state.players.map((pid) => ({
      id: pid,
      cardCount: state.hands[pid]?.length ?? 0,
    }));
    return {
      myHand: [],
      topCard: topCardSerialized,
      activeColor: state.activeColor,
      drawPileCount: state.drawPile.length,
      players,
      currentPlayer: state.players[state.currentPlayerIdx] ?? '',
      direction: state.direction,
      phase: state.phase,
      winner: state.winner,
      hasDrawnThisTurn: state.hasDrawnThisTurn,
    };
  },
};
