import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import {
  ALL_CARDS,
  ALL_NOBLES,
  type Action,
  ActionSchema,
  type Card,
  GEMS,
  GOLD_PER_GAME,
  type GemCount,
  MAX_GEMS,
  MAX_RESERVED,
  type Noble,
  type PlayerInfo,
  type PlayerView,
  type Token,
  type TokenCount,
  VISIBLE_PER_LEVEL,
  WIN_POINTS,
  emptyGemCount,
  emptyTokenCount,
  noblesCount,
  supplyPerColor,
} from './shared';

// ---- Internal State ----

interface PlayerState {
  gems: TokenCount;
  bonuses: GemCount;
  cards: Card[];
  reserved: Card[];
  nobles: Noble[];
  points: number;
}

interface SplendorState {
  players: string[];
  currentPlayerIndex: number;
  supply: TokenCount;
  decks: Record<1 | 2 | 3, Card[]>;
  visible: Record<1 | 2 | 3, (Card | null)[]>;
  nobles: Noble[];
  playerStates: Record<string, PlayerState>;
  lastRoundStartedBy: string | null;
  winner: string | null;
}

// ---- Helpers ----

function sumTokens(tc: TokenCount): number {
  let n = 0;
  for (const k of Object.keys(tc) as Token[]) n += tc[k];
  return n;
}

function emptyPlayerState(): PlayerState {
  return {
    gems: emptyTokenCount(),
    bonuses: emptyGemCount(),
    cards: [],
    reserved: [],
    nobles: [],
    points: 0,
  };
}

function cloneTokenCount(tc: TokenCount): TokenCount {
  return { ...tc };
}

function cloneGemCount(gc: GemCount): GemCount {
  return { ...gc };
}

function clonePlayerState(ps: PlayerState): PlayerState {
  return {
    gems: cloneTokenCount(ps.gems),
    bonuses: cloneGemCount(ps.bonuses),
    cards: [...ps.cards],
    reserved: [...ps.reserved],
    nobles: [...ps.nobles],
    points: ps.points,
  };
}

function eligibleNobles(nobles: Noble[], bonuses: GemCount): Noble[] {
  return nobles.filter((n) => GEMS.every((g) => bonuses[g] >= n.requires[g]));
}

/**
 * Compute exact cost payment for a card given the player's current bonuses,
 * gems, and the caller-supplied gold allocation per color.
 * Returns either the breakdown of gems + gold actually spent, or an error.
 */
function resolveCost(
  card: Card,
  player: PlayerState,
  goldAlloc: Partial<GemCount>,
): { ok: true; gemsSpent: GemCount; goldSpent: number } | { ok: false; reason: string } {
  const gemsSpent = emptyGemCount();
  let goldSpent = 0;

  for (const g of GEMS) {
    const after = Math.max(0, card.cost[g] - player.bonuses[g]);
    if (after === 0) {
      if ((goldAlloc[g] ?? 0) > 0) {
        return { ok: false, reason: `${g} 不需要黄金` };
      }
      continue;
    }
    const useGold = goldAlloc[g] ?? 0;
    if (useGold > after) {
      return { ok: false, reason: `${g} 分配的黄金超过需求` };
    }
    const useGem = after - useGold;
    if (player.gems[g] < useGem) {
      return {
        ok: false,
        reason: `${g} 不足（需要 ${useGem}，你有 ${player.gems[g]}）`,
      };
    }
    gemsSpent[g] = useGem;
    goldSpent += useGold;
  }

  if (player.gems.gold < goldSpent) {
    return { ok: false, reason: `黄金不足（需要 ${goldSpent}，你有 ${player.gems.gold}）` };
  }

  return { ok: true, gemsSpent, goldSpent };
}

function topUpVisible(state: SplendorState): SplendorState {
  const newDecks = { ...state.decks };
  const newVisible: Record<1 | 2 | 3, (Card | null)[]> = {
    1: [...state.visible[1]],
    2: [...state.visible[2]],
    3: [...state.visible[3]],
  };
  for (const lvl of [1, 2, 3] as const) {
    for (let i = 0; i < VISIBLE_PER_LEVEL; i++) {
      if (newVisible[lvl][i] === null && newDecks[lvl].length > 0) {
        const [next, ...rest] = newDecks[lvl];
        newDecks[lvl] = rest;
        newVisible[lvl][i] = next;
      }
    }
  }
  return { ...state, decks: newDecks, visible: newVisible };
}

function nextPlayerIndex(state: SplendorState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

function checkGameEnd(state: SplendorState): EngineEvent | null {
  if (state.lastRoundStartedBy === null) return null;
  const nextIdx = nextPlayerIndex(state);
  const nextPlayer = state.players[nextIdx];
  if (nextPlayer !== state.lastRoundStartedBy) return null;

  // Round complete — rank by points desc, then cards asc
  const ranked = [...state.players].sort((a, b) => {
    const pa = state.playerStates[a];
    const pb = state.playerStates[b];
    if (pb.points !== pa.points) return pb.points - pa.points;
    return pa.cards.length - pb.cards.length;
  });
  return { type: 'END_GAME', rankings: ranked };
}

function applyDiscard(
  gems: TokenCount,
  supply: TokenCount,
  discard: Partial<TokenCount> | undefined,
  required: number,
): { ok: true; gems: TokenCount; supply: TokenCount } | { ok: false; reason: string } {
  if (required <= 0) {
    if (discard) {
      for (const t of Object.keys(discard) as Token[]) {
        if ((discard[t] ?? 0) > 0) {
          return { ok: false, reason: '无需丢弃' };
        }
      }
    }
    return { ok: true, gems, supply };
  }
  if (!discard) {
    return { ok: false, reason: `需要丢弃 ${required} 颗宝石` };
  }
  let total = 0;
  for (const t of Object.keys(discard) as Token[]) total += discard[t] ?? 0;
  if (total !== required) {
    return { ok: false, reason: `需要恰好丢弃 ${required} 颗宝石，你提交了 ${total}` };
  }
  const newGems = cloneTokenCount(gems);
  const newSupply = cloneTokenCount(supply);
  for (const t of Object.keys(discard) as Token[]) {
    const n = discard[t] ?? 0;
    if (n === 0) continue;
    if (newGems[t] < n) return { ok: false, reason: `${t} 不够丢弃` };
    newGems[t] -= n;
    newSupply[t] += n;
  }
  return { ok: true, gems: newGems, supply: newSupply };
}

// ---- Log helpers ----

function prependLogs(
  result: ActionResult<SplendorState>,
  ...logs: EngineEvent[]
): ActionResult<SplendorState> {
  if (!result.ok) return result;
  const events = result.events ?? [];
  const endIdx = events.findIndex((e) => e.type === 'END_GAME');
  if (endIdx >= 0) {
    const winner = (result.state as SplendorState).winner;
    return {
      ...result,
      events: [
        ...logs,
        logSystem('log.win', { actorId: winner ?? undefined }),
        ...events,
      ],
    };
  }
  return { ...result, events: [...logs, ...events] };
}

// ---- Action Handlers ----

function handleTakeThree(
  state: SplendorState,
  playerID: string,
  action: Extract<Action, { type: 'take_three' }>,
): ActionResult<SplendorState> {
  const colors = action.colors;
  const unique = new Set(colors);
  if (unique.size !== colors.length) {
    return { ok: false, reason: '颜色必须不重复' };
  }

  // Verify each requested color has supply
  for (const c of colors) {
    if (state.supply[c] <= 0) {
      return { ok: false, reason: `${c} 供应已空` };
    }
  }

  // If fewer than 3 requested, ensure remaining colors are empty
  if (colors.length < 3) {
    const availableOthers = GEMS.filter((g) => !unique.has(g) && state.supply[g] > 0);
    if (availableOthers.length > 0) {
      return { ok: false, reason: '必须尽量取 3 种不同颜色' };
    }
  }

  const ps = clonePlayerState(state.playerStates[playerID]);
  const newSupply = cloneTokenCount(state.supply);
  for (const c of colors) {
    ps.gems[c] += 1;
    newSupply[c] -= 1;
  }

  const overflow = sumTokens(ps.gems) - MAX_GEMS;
  const discardResult = applyDiscard(ps.gems, newSupply, action.discard, Math.max(0, overflow));
  if (!discardResult.ok) return discardResult;
  ps.gems = discardResult.gems;

  const newState: SplendorState = {
    ...state,
    supply: discardResult.supply,
    playerStates: { ...state.playerStates, [playerID]: ps },
  };
  return prependLogs(
    advanceTurn(newState, playerID),
    logAction(playerID, 'log.takeThree', { colors: colors.join(', ') }),
  );
}

function handleTakeTwo(
  state: SplendorState,
  playerID: string,
  action: Extract<Action, { type: 'take_two' }>,
): ActionResult<SplendorState> {
  const color = action.color;
  if (state.supply[color] < 4) {
    return { ok: false, reason: `${color} 必须有至少 4 颗才能取 2 同色` };
  }

  const ps = clonePlayerState(state.playerStates[playerID]);
  const newSupply = cloneTokenCount(state.supply);
  ps.gems[color] += 2;
  newSupply[color] -= 2;

  const overflow = sumTokens(ps.gems) - MAX_GEMS;
  const discardResult = applyDiscard(ps.gems, newSupply, action.discard, Math.max(0, overflow));
  if (!discardResult.ok) return discardResult;
  ps.gems = discardResult.gems;

  const newState: SplendorState = {
    ...state,
    supply: discardResult.supply,
    playerStates: { ...state.playerStates, [playerID]: ps },
  };
  return prependLogs(
    advanceTurn(newState, playerID),
    logAction(playerID, 'log.takeTwo', { color, count: 2 }),
  );
}

function handleReserve(
  state: SplendorState,
  playerID: string,
  action: Extract<Action, { type: 'reserve' }>,
): ActionResult<SplendorState> {
  const ps = clonePlayerState(state.playerStates[playerID]);
  if (ps.reserved.length >= MAX_RESERVED) {
    return { ok: false, reason: `最多只能预订 ${MAX_RESERVED} 张卡` };
  }

  const lvl = action.level;
  const newVisible = [...state.visible[lvl]];
  let newDeck = [...state.decks[lvl]];
  let reservedCard: Card | undefined;

  if (action.source === 'visible') {
    if (!action.cardId) return { ok: false, reason: '预订可见卡需要 cardId' };
    const idx = newVisible.findIndex((c) => c?.id === action.cardId);
    if (idx < 0) return { ok: false, reason: '该卡不在可见区' };
    reservedCard = newVisible[idx] as Card;
    newVisible[idx] = null;
  } else {
    if (newDeck.length === 0) return { ok: false, reason: '该层牌堆已空' };
    reservedCard = newDeck[0];
    newDeck = newDeck.slice(1);
  }

  ps.reserved.push(reservedCard);

  // Gain 1 gold if available
  const newSupply = cloneTokenCount(state.supply);
  if (newSupply.gold > 0) {
    ps.gems.gold += 1;
    newSupply.gold -= 1;
  }

  const overflow = sumTokens(ps.gems) - MAX_GEMS;
  const discardResult = applyDiscard(ps.gems, newSupply, action.discard, Math.max(0, overflow));
  if (!discardResult.ok) return discardResult;
  ps.gems = discardResult.gems;

  let newState: SplendorState = {
    ...state,
    supply: discardResult.supply,
    decks: { ...state.decks, [lvl]: newDeck },
    visible: { ...state.visible, [lvl]: newVisible },
    playerStates: { ...state.playerStates, [playerID]: ps },
  };
  newState = topUpVisible(newState);
  return prependLogs(
    advanceTurn(newState, playerID),
    logAction(playerID, 'log.reserve', { level: lvl }),
  );
}

function handleBuy(
  state: SplendorState,
  playerID: string,
  action: Extract<Action, { type: 'buy' }>,
): ActionResult<SplendorState> {
  const ps = clonePlayerState(state.playerStates[playerID]);
  let card: Card | undefined;
  let newVisible = state.visible;
  let newReserved = ps.reserved;

  if (action.source === 'visible') {
    for (const lvl of [1, 2, 3] as const) {
      const idx = state.visible[lvl].findIndex((c) => c?.id === action.cardId);
      if (idx >= 0) {
        card = state.visible[lvl][idx] as Card;
        const v = [...state.visible[lvl]];
        v[idx] = null;
        newVisible = { ...state.visible, [lvl]: v };
        break;
      }
    }
    if (!card) return { ok: false, reason: '该卡不在可见区' };
  } else {
    const idx = ps.reserved.findIndex((c) => c.id === action.cardId);
    if (idx < 0) return { ok: false, reason: '该卡不在你的预订区' };
    card = ps.reserved[idx];
    newReserved = ps.reserved.filter((_, i) => i !== idx);
  }

  const goldAlloc = action.gold ?? {};
  const resolved = resolveCost(card, ps, goldAlloc);
  if (!resolved.ok) return resolved;

  // Pay
  const newSupply = cloneTokenCount(state.supply);
  for (const g of GEMS) {
    ps.gems[g] -= resolved.gemsSpent[g];
    newSupply[g] += resolved.gemsSpent[g];
  }
  ps.gems.gold -= resolved.goldSpent;
  newSupply.gold += resolved.goldSpent;

  // Gain card
  ps.reserved = newReserved;
  ps.cards.push(card);
  ps.bonuses[card.bonus] += 1;
  ps.points += card.points;

  // Check nobles
  const visitable = eligibleNobles(state.nobles, ps.bonuses);
  let remainingNobles = state.nobles;
  let nobleAcquired = false;
  if (visitable.length === 1) {
    const n = visitable[0];
    ps.nobles.push(n);
    ps.points += n.points;
    remainingNobles = state.nobles.filter((x) => x.id !== n.id);
    nobleAcquired = true;
  } else if (visitable.length > 1) {
    if (!action.claimNoble) {
      const ids = visitable.map((n) => n.id).join(', ');
      return { ok: false, reason: `多位贵族可访问，必须选择一位（claimNoble）：${ids}` };
    }
    const chosen = visitable.find((n) => n.id === action.claimNoble);
    if (!chosen) return { ok: false, reason: '选择的贵族不可访问' };
    ps.nobles.push(chosen);
    ps.points += chosen.points;
    remainingNobles = state.nobles.filter((x) => x.id !== chosen.id);
    nobleAcquired = true;
  } else if (action.claimNoble) {
    return { ok: false, reason: '当前无可访问贵族' };
  }

  let newState: SplendorState = {
    ...state,
    supply: newSupply,
    visible: newVisible,
    nobles: remainingNobles,
    playerStates: { ...state.playerStates, [playerID]: ps },
  };
  newState = topUpVisible(newState);
  const buyLog = logAction(playerID, 'log.buy', { points: card.points });
  const logs: EngineEvent[] = nobleAcquired
    ? [buyLog, logSystem('log.nobleVisit', { actorId: playerID })]
    : [buyLog];
  return prependLogs(advanceTurn(newState, playerID), ...logs);
}

function advanceTurn(state: SplendorState, playerID: string): ActionResult<SplendorState> {
  // If this player has just reached WIN_POINTS and last-round hasn't started, start it.
  const ps = state.playerStates[playerID];
  let newState = state;
  if (newState.lastRoundStartedBy === null && ps.points >= WIN_POINTS) {
    // last-round finishes when we wrap back to the starter.
    // We record the player who WOULD play next after we loop all the way around;
    // when the next player to act equals this, the game ends.
    const firstPlayer = newState.players[0];
    newState = { ...newState, lastRoundStartedBy: firstPlayer };
  }

  const events: EngineEvent[] = [];
  // Check if round has completed
  const endEvent = checkGameEnd(newState);
  if (endEvent) {
    const winner = (endEvent as Extract<EngineEvent, { type: 'END_GAME' }>).rankings[0];
    newState = { ...newState, winner };
    events.push(endEvent);
    return { ok: true, state: newState, events };
  }

  newState = { ...newState, currentPlayerIndex: nextPlayerIndex(newState) };
  return { ok: true, state: newState, events };
}

// ---- Main Logic ----

export const logic: GameLogic<SplendorState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): SplendorState {
    const playerCount = ctx.players.length;
    const perColor = supplyPerColor(playerCount);
    const supply: TokenCount = {
      white: perColor,
      blue: perColor,
      green: perColor,
      red: perColor,
      black: perColor,
      gold: GOLD_PER_GAME,
    };

    const byLevel: Record<1 | 2 | 3, Card[]> = { 1: [], 2: [], 3: [] };
    for (const c of ALL_CARDS) byLevel[c.level].push(c);
    const decks: Record<1 | 2 | 3, Card[]> = {
      1: ctx.random.shuffle(byLevel[1]),
      2: ctx.random.shuffle(byLevel[2]),
      3: ctx.random.shuffle(byLevel[3]),
    };

    const visible: Record<1 | 2 | 3, (Card | null)[]> = { 1: [], 2: [], 3: [] };
    for (const lvl of [1, 2, 3] as const) {
      for (let i = 0; i < VISIBLE_PER_LEVEL; i++) {
        visible[lvl].push(decks[lvl].shift() ?? null);
      }
    }

    const nobles = ctx.random.shuffle([...ALL_NOBLES]).slice(0, noblesCount(playerCount));

    const playerStates: Record<string, PlayerState> = {};
    for (const pid of ctx.players) playerStates[pid] = emptyPlayerState();

    return {
      players: ctx.players,
      currentPlayerIndex: 0,
      supply,
      decks,
      visible,
      nobles,
      playerStates,
      lastRoundStartedBy: null,
      winner: null,
    };
  },

  onAction(state, action, playerID): ActionResult<SplendorState> {
    if (state.winner) return { ok: false, reason: '游戏已结束' };
    const current = state.players[state.currentPlayerIndex];
    if (playerID !== current) return { ok: false, reason: '还没轮到你' };

    switch (action.type) {
      case 'take_three':
        return handleTakeThree(state, playerID, action);
      case 'take_two':
        return handleTakeTwo(state, playerID, action);
      case 'reserve':
        return handleReserve(state, playerID, action);
      case 'buy':
        return handleBuy(state, playerID, action);
    }
  },

  getPlayerView(state, playerID): PlayerView {
    const players: PlayerInfo[] = state.players.map((pid) => {
      const ps = state.playerStates[pid];
      return {
        id: pid,
        gems: cloneTokenCount(ps.gems),
        bonuses: cloneGemCount(ps.bonuses),
        points: ps.points,
        reservedCount: ps.reserved.length,
        noblesCount: ps.nobles.length,
        cardCount: ps.cards.length,
      };
    });

    const myReserved = state.playerStates[playerID]?.reserved ?? [];

    const deckCounts: Record<1 | 2 | 3, number> = {
      1: state.decks[1].length,
      2: state.decks[2].length,
      3: state.decks[3].length,
    };

    return {
      supply: cloneTokenCount(state.supply),
      visible: {
        1: [...state.visible[1]],
        2: [...state.visible[2]],
        3: [...state.visible[3]],
      },
      deckCounts,
      nobles: [...state.nobles],
      players,
      myReserved: [...myReserved],
      currentPlayer: state.players[state.currentPlayerIndex],
      lastRoundStartedBy: state.lastRoundStartedBy,
      winner: state.winner,
    };
  },

  getSpectatorView(state): PlayerView {
    const players: PlayerInfo[] = state.players.map((pid) => {
      const ps = state.playerStates[pid];
      return {
        id: pid,
        gems: cloneTokenCount(ps.gems),
        bonuses: cloneGemCount(ps.bonuses),
        points: ps.points,
        reservedCount: ps.reserved.length,
        noblesCount: ps.nobles.length,
        cardCount: ps.cards.length,
      };
    });

    return {
      supply: cloneTokenCount(state.supply),
      visible: {
        1: [...state.visible[1]],
        2: [...state.visible[2]],
        3: [...state.visible[3]],
      },
      deckCounts: {
        1: state.decks[1].length,
        2: state.decks[2].length,
        3: state.decks[3].length,
      },
      nobles: [...state.nobles],
      players,
      myReserved: [],
      currentPlayer: state.players[state.currentPlayerIndex],
      lastRoundStartedBy: state.lastRoundStartedBy,
      winner: state.winner,
    };
  },
};
