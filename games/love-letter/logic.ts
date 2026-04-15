import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  CARD_COUNTS,
  CARD_NAMES,
  OTHER_TARGET_CARDS,
  type PlayedCardEntry,
  type PlayerView,
  type PlayerViewInfo,
} from './shared';

// ---- Internal State (never sent to clients) ----

interface LoveLetterState {
  deck: number[];
  setAsideCard: number;
  removedCards: number[]; // face-up removed cards (2-player)
  hands: Record<string, number[]>;
  alive: Record<string, boolean>;
  protected: Record<string, boolean>;
  playedCards: Record<string, number[]>;
  playLog: PlayedCardEntry[];
  currentPlayerIndex: number;
  players: string[];
  winner: string | null;
}

function buildDeck(): number[] {
  const deck: number[] = [];
  for (const [card, count] of Object.entries(CARD_COUNTS)) {
    for (let i = 0; i < count; i++) {
      deck.push(Number(card));
    }
  }
  return deck;
}

function getAlivePlayers(state: LoveLetterState): string[] {
  return state.players.filter((p) => state.alive[p]);
}

function getValidTargets(state: LoveLetterState, playerID: string): string[] {
  return state.players.filter((p) => p !== playerID && state.alive[p] && !state.protected[p]);
}

function hasValidTargets(state: LoveLetterState, playerID: string): boolean {
  return getValidTargets(state, playerID).length > 0;
}

function nextAlivePlayerIndex(state: LoveLetterState): number {
  const { players, alive, currentPlayerIndex } = state;
  let idx = currentPlayerIndex;
  for (let i = 0; i < players.length; i++) {
    idx = (idx + 1) % players.length;
    if (alive[players[idx]]) return idx;
  }
  return currentPlayerIndex;
}

function eliminatePlayer(state: LoveLetterState, playerId: string): LoveLetterState {
  const discarded = state.hands[playerId] ?? [];
  return {
    ...state,
    alive: { ...state.alive, [playerId]: false },
    protected: { ...state.protected, [playerId]: false },
    playedCards: {
      ...state.playedCards,
      [playerId]: [...(state.playedCards[playerId] ?? []), ...discarded],
    },
    hands: { ...state.hands, [playerId]: [] },
  };
}

function checkGameEnd(state: LoveLetterState): EngineEvent | null {
  const alive = getAlivePlayers(state);

  // Last player standing
  if (alive.length === 1) {
    const winner = alive[0];
    const eliminated = state.players.filter((p) => p !== winner);
    return { type: 'END_GAME', rankings: [winner, ...eliminated] };
  }

  // Deck empty — compare hands
  if (state.deck.length === 0) {
    const handValues = alive.map((p) => ({
      id: p,
      hand: state.hands[p][0] ?? 0,
      discardSum: (state.playedCards[p] ?? []).reduce((a, b) => a + b, 0),
    }));

    handValues.sort((a, b) => {
      if (b.hand !== a.hand) return b.hand - a.hand;
      return b.discardSum - a.discardSum;
    });

    const ranked = handValues.map((p) => p.id);
    const dead = state.players.filter((p) => !state.alive[p]);
    return { type: 'END_GAME', rankings: [...ranked, ...dead] };
  }

  return null;
}

function advanceTurn(state: LoveLetterState): LoveLetterState {
  const nextIdx = nextAlivePlayerIndex(state);
  const nextPlayer = state.players[nextIdx];

  // Clear protection for the next player (cleared at start of their turn)
  const newProtected = { ...state.protected, [nextPlayer]: false };

  // Draw a card for the next player
  if (state.deck.length > 0) {
    const [drawn, ...rest] = state.deck;
    return {
      ...state,
      deck: rest,
      currentPlayerIndex: nextIdx,
      protected: newProtected,
      hands: {
        ...state.hands,
        [nextPlayer]: [...state.hands[nextPlayer], drawn],
      },
    };
  }

  // Deck empty — no draw, just advance
  return {
    ...state,
    currentPlayerIndex: nextIdx,
    protected: newProtected,
  };
}

function cardName(card: number): string {
  return `${CARD_NAMES[card]}(${card})`;
}

export const logic: GameLogic<LoveLetterState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): LoveLetterState {
    let deck = ctx.random.shuffle(buildDeck());

    // Set aside 1 card face-down
    const setAsideCard = deck[0];
    deck = deck.slice(1);

    // 2-player variant: remove 3 cards face-up
    let removedCards: number[] = [];
    if (ctx.players.length === 2) {
      removedCards = deck.slice(0, 3);
      deck = deck.slice(3);
    }

    // Deal 1 card to each player
    const hands: Record<string, number[]> = {};
    for (const pid of ctx.players) {
      hands[pid] = [deck[0]];
      deck = deck.slice(1);
    }

    // Draw a second card for the first player
    hands[ctx.players[0]] = [...hands[ctx.players[0]], deck[0]];
    deck = deck.slice(1);

    const alive: Record<string, boolean> = {};
    const prot: Record<string, boolean> = {};
    const playedCards: Record<string, number[]> = {};
    for (const pid of ctx.players) {
      alive[pid] = true;
      prot[pid] = false;
      playedCards[pid] = [];
    }

    return {
      deck,
      setAsideCard,
      removedCards,
      hands,
      alive,
      protected: prot,
      playedCards,
      playLog: [],
      currentPlayerIndex: 0,
      players: ctx.players,
      winner: null,
    };
  },

  onAction(state, action, playerID, ctx): ActionResult<LoveLetterState> {
    if (state.winner) {
      return { ok: false, reason: '游戏已结束' };
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (playerID !== currentPlayer) {
      return { ok: false, reason: '还没轮到你' };
    }

    if (!state.alive[playerID]) {
      return { ok: false, reason: '你已被淘汰' };
    }

    const hand = state.hands[playerID];
    const cardIndex = hand.indexOf(action.card);
    if (cardIndex === -1) {
      return { ok: false, reason: '你没有这张牌' };
    }

    // Countess forced play: must play Countess if holding King or Prince
    if (action.card !== 7 && hand.includes(7)) {
      const otherCard = hand.find((c) => c !== 7)!;
      if (otherCard === 5 || otherCard === 6) {
        return { ok: false, reason: '持有国王或王子时必须打出伯爵夫人' };
      }
    }

    // Validate target for targeting cards
    const needsOtherTarget = (OTHER_TARGET_CARDS as readonly number[]).includes(action.card);
    const hasPossibleTargets = hasValidTargets(state, playerID);

    if (needsOtherTarget && hasPossibleTargets) {
      if (!action.target) {
        return { ok: false, reason: '需要选择一个目标' };
      }
      if (action.target === playerID) {
        return { ok: false, reason: '不能选择自己为目标' };
      }
      if (!state.alive[action.target]) {
        return { ok: false, reason: '目标已被淘汰' };
      }
      if (state.protected[action.target]) {
        return { ok: false, reason: '目标受到侍女保护' };
      }
    }

    // Prince can target self or alive others (non-protected or self)
    if (action.card === 5) {
      if (!action.target) {
        return { ok: false, reason: '需要选择一个目标' };
      }
      if (!state.alive[action.target]) {
        return { ok: false, reason: '目标已被淘汰' };
      }
      if (action.target !== playerID && state.protected[action.target]) {
        // If all others are protected, must target self
        if (hasPossibleTargets) {
          return { ok: false, reason: '目标受到侍女保护' };
        }
      }
    }

    // Guard needs a guess
    if (action.card === 1 && hasPossibleTargets && action.target) {
      if (action.guess === undefined) {
        return { ok: false, reason: '需要猜测一个数字' };
      }
    }

    // Remove played card from hand
    const newHand = [...hand];
    newHand.splice(cardIndex, 1);
    let newState: LoveLetterState = {
      ...state,
      hands: { ...state.hands, [playerID]: newHand },
      playedCards: {
        ...state.playedCards,
        [playerID]: [...state.playedCards[playerID], action.card],
      },
    };

    const events: EngineEvent[] = [];
    let effectDesc = '';

    // Execute card effects
    switch (action.card) {
      case 1: {
        // Guard
        if (!action.target || !hasPossibleTargets) {
          effectDesc = '无可用目标，无效果';
          break;
        }
        const targetHand = newState.hands[action.target];
        if (targetHand.length > 0 && targetHand[0] === action.guess) {
          newState = eliminatePlayer(newState, action.target);
          effectDesc = `猜测 ${action.target} 持有${cardName(action.guess!)}，猜对了！`;
        } else {
          effectDesc = `猜测 ${action.target} 持有${cardName(action.guess!)}，猜错了`;
        }
        break;
      }

      case 2: {
        // Priest
        if (!action.target || !hasPossibleTargets) {
          effectDesc = '无可用目标，无效果';
          break;
        }
        const peekedCard = newState.hands[action.target][0];
        events.push({
          type: 'NOTIFY',
          to: playerID,
          payload: { type: 'priest_peek', target: action.target, card: peekedCard },
        });
        effectDesc = `偷看了 ${action.target} 的手牌`;
        break;
      }

      case 3: {
        // Baron
        if (!action.target || !hasPossibleTargets) {
          effectDesc = '无可用目标，无效果';
          break;
        }
        const myCard = newHand[0];
        const theirCard = newState.hands[action.target][0];
        if (myCard > theirCard) {
          newState = eliminatePlayer(newState, action.target);
          effectDesc = `与 ${action.target} 比较手牌，${action.target} 被淘汰`;
        } else if (myCard < theirCard) {
          newState = eliminatePlayer(newState, playerID);
          effectDesc = `与 ${action.target} 比较手牌，自己被淘汰`;
        } else {
          effectDesc = `与 ${action.target} 比较手牌，平局`;
        }
        // Notify both players about the comparison
        events.push({
          type: 'NOTIFY',
          to: playerID,
          payload: { type: 'baron_compare', myCard, theirCard, target: action.target },
        });
        events.push({
          type: 'NOTIFY',
          to: action.target,
          payload: {
            type: 'baron_compare',
            myCard: theirCard,
            theirCard: myCard,
            target: playerID,
          },
        });
        break;
      }

      case 4: {
        // Handmaid
        newState = {
          ...newState,
          protected: { ...newState.protected, [playerID]: true },
        };
        effectDesc = '获得侍女保护';
        break;
      }

      case 5: {
        // Prince
        const target = action.target ?? playerID;
        const discardedCard = newState.hands[target]?.[0];

        if (discardedCard === undefined) break;

        // Target discards their card
        newState = {
          ...newState,
          playedCards: {
            ...newState.playedCards,
            [target]: [...newState.playedCards[target], discardedCard],
          },
          hands: { ...newState.hands, [target]: [] },
        };

        // Princess discarded → eliminated
        if (discardedCard === 8) {
          newState = eliminatePlayer(newState, target);
          effectDesc =
            target === playerID
              ? '弃掉了公主，自己出局'
              : `强制 ${target} 弃牌，弃掉了公主，${target} 出局`;
        } else {
          // Draw new card
          if (newState.deck.length > 0) {
            const [drawn, ...rest] = newState.deck;
            newState = {
              ...newState,
              deck: rest,
              hands: { ...newState.hands, [target]: [drawn] },
            };
          } else {
            // Draw the set-aside card
            newState = {
              ...newState,
              hands: { ...newState.hands, [target]: [newState.setAsideCard] },
            };
          }
          effectDesc = target === playerID ? '弃掉手牌并重新摸牌' : `强制 ${target} 弃牌并重新摸牌`;
        }
        break;
      }

      case 6: {
        // King
        if (!action.target || !hasPossibleTargets) {
          effectDesc = '无可用目标，无效果';
          break;
        }
        const myCards = [...newState.hands[playerID]];
        const theirCards = [...newState.hands[action.target]];
        newState = {
          ...newState,
          hands: {
            ...newState.hands,
            [playerID]: theirCards,
            [action.target]: myCards,
          },
        };
        effectDesc = `与 ${action.target} 交换了手牌`;
        break;
      }

      case 7: {
        // Countess
        effectDesc = '打出伯爵夫人';
        break;
      }

      case 8: {
        // Princess
        newState = eliminatePlayer(newState, playerID);
        effectDesc = '打出公主，自己出局';
        break;
      }
    }

    // Add to play log
    const logEntry: PlayedCardEntry = {
      playerId: playerID,
      card: action.card,
      target: action.target,
      guess: action.guess,
      effect: effectDesc,
    };
    newState = { ...newState, playLog: [...newState.playLog, logEntry] };

    // Check for game end
    const endEvent = checkGameEnd(newState);
    if (endEvent) {
      newState = { ...newState, winner: (endEvent as any).rankings[0] };
      events.push(endEvent);
      return { ok: true, state: newState, events };
    }

    // Advance turn
    newState = advanceTurn(newState);

    // Check game end again (deck might have run out after drawing)
    const endEvent2 = checkGameEnd(newState);
    if (endEvent2) {
      newState = { ...newState, winner: (endEvent2 as any).rankings[0] };
      events.push(endEvent2);
      return { ok: true, state: newState, events };
    }

    return { ok: true, state: newState, events };
  },

  getPlayerView(state, playerID): PlayerView {
    const players: PlayerViewInfo[] = state.players.map((pid) => ({
      id: pid,
      alive: state.alive[pid],
      protected: state.protected[pid],
      playedCards: state.playedCards[pid] ?? [],
      cardCount: state.hands[pid]?.length ?? 0,
    }));

    return {
      hand: state.hands[playerID] ?? [],
      players,
      currentPlayer: state.players[state.currentPlayerIndex],
      deckSize: state.deck.length,
      playLog: state.playLog,
      removedCards: state.removedCards,
      winner: state.winner,
    };
  },

  getSpectatorView(state): PlayerView {
    const players: PlayerViewInfo[] = state.players.map((pid) => ({
      id: pid,
      alive: state.alive[pid],
      protected: state.protected[pid],
      playedCards: state.playedCards[pid] ?? [],
      cardCount: state.hands[pid]?.length ?? 0,
    }));

    return {
      hand: [],
      players,
      currentPlayer: state.players[state.currentPlayerIndex],
      deckSize: state.deck.length,
      playLog: state.playLog,
      removedCards: state.removedCards,
      winner: state.winner,
    };
  },
};
