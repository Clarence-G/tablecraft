import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  type BettingRound,
  type GamePhase,
  type HandPhase,
  type PlayerView,
  createDeck,
} from './shared';

// ---- Internal State ----

interface PlayerHoldem {
  id: string;
  chips: number;
  holeCards: [string, string] | null;
  currentBet: number;
  totalBetThisHand: number;
  hasActed: boolean;
  status: 'active' | 'folded' | 'all_in' | 'eliminated';
}

interface HoldemState {
  players: PlayerHoldem[];
  deck: string[];
  communityCards: string[];
  pot: number;
  sidePots: Array<{ amount: number; eligiblePlayerIds: string[] }>;
  bettingRound: BettingRound;
  handPhase: HandPhase;
  gamePhase: GamePhase;
  currentPlayerIdx: number;
  dealerIdx: number;
  bigBlind: number;
  smallBlind: number;
  lastRaiseAmount: number;
  minRaise: number;
  handNumber: number;
  winner: string | null;
  showdownResult: Array<{ playerId: string; handName: string; amount: number }> | null;
}

// ---- Hand Evaluation (pure, no Math.random) ----

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const result: T[][] = [];
  const [first, ...rest] = arr;
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }
  for (const combo of combinations(rest, k)) {
    result.push(combo);
  }
  return result;
}

const RANKS_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

function rankVal(rankStr: string): number {
  const idx = RANKS_ORDER.indexOf(rankStr as (typeof RANKS_ORDER)[number]);
  return idx + 2;
}

function parseCard(card: string): { rank: number; suit: string } {
  const r = card.length === 3 ? card.slice(0, 2) : (card[0] ?? '');
  const s = card[card.length - 1] ?? '';
  return { rank: rankVal(r), suit: s };
}

interface HandRank {
  rank: number;
  tiebreakers: number[];
  name: string;
}

function rankName(r: number): string {
  const names: Record<number, string> = {
    14: 'Ace',
    13: 'King',
    12: 'Queen',
    11: 'Jack',
    10: 'Ten',
    9: 'Nine',
    8: 'Eight',
    7: 'Seven',
    6: 'Six',
    5: 'Five',
    4: 'Four',
    3: 'Three',
    2: 'Two',
  };
  return names[r] ?? String(r);
}

function evaluateFiveCards(cards: string[]): HandRank {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map((c) => c.rank).sort((a, b) => b - a);
  const suits = parsed.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  let straightHigh: number | null = null;
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniqueRanks.length === 5) {
    if ((uniqueRanks[0] ?? 0) - (uniqueRanks[4] ?? 0) === 4) {
      straightHigh = uniqueRanks[0] ?? null;
    }
    if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      straightHigh = 5;
    }
  }
  const isStraight = straightHigh !== null;

  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isFlush && isStraight && straightHigh === 14) {
    return { rank: 9, tiebreakers: [14], name: 'Royal Flush' };
  }
  if (isFlush && isStraight && straightHigh !== null) {
    return {
      rank: 8,
      tiebreakers: [straightHigh],
      name: `Straight Flush, ${rankName(straightHigh)} high`,
    };
  }
  if (groups[0] && groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1]?.[0] ?? 0;
    return { rank: 7, tiebreakers: [quad, kicker], name: `Four of a Kind, ${rankName(quad)}s` };
  }
  if (groups[0] && groups[0][1] === 3 && groups[1] && groups[1][1] === 2) {
    return {
      rank: 6,
      tiebreakers: [groups[0][0], groups[1][0]],
      name: `Full House, ${rankName(groups[0][0])}s over ${rankName(groups[1][0])}s`,
    };
  }
  if (isFlush) {
    return { rank: 5, tiebreakers: ranks, name: `Flush, ${rankName(ranks[0] ?? 0)} high` };
  }
  if (isStraight && straightHigh !== null) {
    return {
      rank: 4,
      tiebreakers: [straightHigh],
      name: `Straight, ${rankName(straightHigh)} high`,
    };
  }
  if (groups[0] && groups[0][1] === 3) {
    const triple = groups[0][0];
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return {
      rank: 3,
      tiebreakers: [triple, ...kickers],
      name: `Three of a Kind, ${rankName(triple)}s`,
    };
  }
  if (groups[0] && groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2]?.[0] ?? 0;
    return {
      rank: 2,
      tiebreakers: [highPair, lowPair, kicker],
      name: `Two Pair, ${rankName(highPair)}s and ${rankName(lowPair)}s`,
    };
  }
  if (groups[0] && groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return { rank: 1, tiebreakers: [pair, ...kickers], name: `One Pair, ${rankName(pair)}s` };
  }
  return { rank: 0, tiebreakers: ranks, name: `High Card, ${rankName(ranks[0] ?? 0)}` };
}

function evaluateHand(sevenCards: string[]): HandRank {
  const combos = combinations(sevenCards, 5);
  let best: HandRank | null = null;
  for (const combo of combos) {
    const hr = evaluateFiveCards(combo);
    if (!best || compareHands(hr, best) > 0) {
      best = hr;
    }
  }
  return best ?? { rank: 0, tiebreakers: [], name: 'High Card' };
}

function compareHands(a: HandRank, b: HandRank): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const at = a.tiebreakers[i] ?? 0;
    const bt = b.tiebreakers[i] ?? 0;
    if (at !== bt) return at - bt;
  }
  return 0;
}

// ---- Position Helpers ----

function nextIdx(from: number, count: number): number {
  return (from + 1) % count;
}

function getNextActivePlayerIdx(players: PlayerHoldem[], fromIdx: number): number | null {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n;
    const p = players[idx];
    if (p && p.status === 'active') return idx;
  }
  return null;
}

function getFirstActorPreflop(players: PlayerHoldem[], dealerIdx: number): number | null {
  const n = players.length;
  if (n === 2) {
    // Heads-up: dealer/SB acts first
    if (players[dealerIdx]?.status === 'active') return dealerIdx;
    return getNextActivePlayerIdx(players, dealerIdx);
  }
  // UTG: 2 seats after dealer (skip SB, BB)
  const bbIdx = (dealerIdx + 2) % n;
  return getNextActivePlayerIdx(players, bbIdx);
}

function getFirstActorPostflop(players: PlayerHoldem[], dealerIdx: number): number | null {
  return getNextActivePlayerIdx(players, dealerIdx);
}

function isBettingComplete(players: PlayerHoldem[]): boolean {
  const active = players.filter((p) => p.status === 'active');
  if (active.length === 0) return true;
  const allActed = active.every((p) => p.hasActed);
  if (!allActed) return false;
  const bets = active.map((p) => p.currentBet);
  return bets.every((b) => b === (bets[0] ?? 0));
}

function countInHand(players: PlayerHoldem[]): number {
  return players.filter((p) => p.status === 'active' || p.status === 'all_in').length;
}

// ---- Side Pots & Winners ----

function calculateSidePots(
  players: PlayerHoldem[],
): Array<{ amount: number; eligiblePlayerIds: string[] }> {
  const betInfos = players.map((p) => ({
    id: p.id,
    totalBet: p.totalBetThisHand,
    folded: p.status === 'folded' || p.status === 'eliminated',
  }));

  const levels = [...new Set(betInfos.map((p) => p.totalBet))]
    .filter((b) => b > 0)
    .sort((a, b) => a - b);
  if (levels.length === 0) return [];

  const pots: Array<{ amount: number; eligiblePlayerIds: string[] }> = [];
  let prevLevel = 0;

  for (const level of levels) {
    const increment = level - prevLevel;
    if (increment <= 0) continue;
    const contributors = betInfos.filter((p) => p.totalBet >= level);
    const amount = increment * contributors.length;
    const eligible = contributors.filter((p) => !p.folded).map((p) => p.id);
    if (amount > 0) {
      const ids =
        eligible.length > 0 ? eligible : betInfos.filter((p) => !p.folded).map((p) => p.id);
      if (ids.length > 0) pots.push({ amount, eligiblePlayerIds: ids });
    }
    prevLevel = level;
  }

  const merged: Array<{ amount: number; eligiblePlayerIds: string[] }> = [];
  for (const pot of pots) {
    const key = [...pot.eligiblePlayerIds].sort().join(',');
    const existing = merged.find((m) => [...m.eligiblePlayerIds].sort().join(',') === key);
    if (existing) {
      existing.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  }
  return merged;
}

function determineShowdownWinners(
  sidePots: Array<{ amount: number; eligiblePlayerIds: string[] }>,
  holeCardsMap: Map<string, [string, string]>,
  communityCards: string[],
): Array<{ playerId: string; amount: number; handName: string }> {
  const results: Array<{ playerId: string; amount: number; handName: string }> = [];

  for (const pot of sidePots) {
    const hands: Array<{ id: string; hr: HandRank }> = [];
    for (const id of pot.eligiblePlayerIds) {
      const hole = holeCardsMap.get(id);
      if (!hole) continue;
      const allCards = [...hole, ...communityCards];
      hands.push({ id, hr: evaluateHand(allCards) });
    }
    if (hands.length === 0) continue;

    hands.sort((a, b) => compareHands(b.hr, a.hr));
    const bestHr = hands[0]?.hr ?? { rank: 0, tiebreakers: [], name: '' };
    const winners = hands.filter((h) => compareHands(h.hr, bestHr) === 0);

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    winners.forEach((w, i) => {
      results.push({
        playerId: w.id,
        amount: share + (i === 0 ? remainder : 0),
        handName: w.hr.name,
      });
    });
  }

  const merged = new Map<string, { playerId: string; amount: number; handName: string }>();
  for (const r of results) {
    const ex = merged.get(r.playerId);
    if (ex) {
      ex.amount += r.amount;
    } else {
      merged.set(r.playerId, { ...r });
    }
  }
  return [...merged.values()];
}

// ---- Setup Helpers ----

function dealNewHand(state: HoldemState, ctx: GameContext): HoldemState {
  const deck = ctx.random.shuffle(createDeck());

  // Reset players for new hand
  const players: PlayerHoldem[] = state.players.map((p) => ({
    ...p,
    holeCards: null,
    currentBet: 0,
    totalBetThisHand: 0,
    hasActed: false,
    status: p.chips > 0 ? 'active' : 'eliminated',
  }));

  const n = players.length;
  let deckIdx = 0;

  // Deal 2 cards to each non-eliminated player
  for (let i = 0; i < n; i++) {
    const p = players[i];
    if (p && p.status !== 'eliminated') {
      const c1 = deck[deckIdx++] ?? 'As';
      const c2 = deck[deckIdx++] ?? 'Kh';
      players[i] = { ...p, holeCards: [c1, c2] };
    }
  }

  const remainingDeck = deck.slice(deckIdx);

  // Find dealer idx among active players
  let dealerIdx = state.dealerIdx;
  // Advance dealer to next non-eliminated player
  const activePlayers = players.filter((p) => p.status !== 'eliminated');
  if (activePlayers.length < 2) {
    return { ...state, players, gamePhase: 'finished' };
  }

  // Rotate dealer
  for (let i = 1; i <= n; i++) {
    const candidate = (dealerIdx + i) % n;
    if (players[candidate]?.status !== 'eliminated') {
      dealerIdx = candidate;
      break;
    }
  }

  const sbIdx = nextIdx(dealerIdx, n);
  // Find SB (skip eliminated)
  let actualSbIdx = sbIdx;
  for (let i = 0; i < n; i++) {
    const candidate = (sbIdx + i) % n;
    if (players[candidate]?.status !== 'eliminated') {
      actualSbIdx = candidate;
      break;
    }
  }

  const bbIdx = nextIdx(actualSbIdx, n);
  let actualBbIdx = bbIdx;
  for (let i = 0; i < n; i++) {
    const candidate = (bbIdx + i) % n;
    if (players[candidate]?.status !== 'eliminated' && candidate !== actualSbIdx) {
      actualBbIdx = candidate;
      break;
    }
  }

  // For heads-up: dealer is SB
  const bigBlind = 20;
  const smallBlind = 10;

  // Post blinds
  const newPlayers = [...players];

  const sbPlayer = newPlayers[actualSbIdx];
  if (sbPlayer) {
    const sbAmt = Math.min(smallBlind, sbPlayer.chips);
    newPlayers[actualSbIdx] = {
      ...sbPlayer,
      chips: sbPlayer.chips - sbAmt,
      currentBet: sbAmt,
      totalBetThisHand: sbAmt,
      status: sbPlayer.chips - sbAmt === 0 ? 'all_in' : 'active',
    };
  }

  const bbPlayer = newPlayers[actualBbIdx];
  if (bbPlayer) {
    const bbAmt = Math.min(bigBlind, bbPlayer.chips);
    newPlayers[actualBbIdx] = {
      ...bbPlayer,
      chips: bbPlayer.chips - bbAmt,
      currentBet: bbAmt,
      totalBetThisHand: bbAmt,
      status: bbPlayer.chips - bbAmt === 0 ? 'all_in' : 'active',
    };
  }

  const pot =
    (newPlayers[actualSbIdx]?.currentBet ?? 0) + (newPlayers[actualBbIdx]?.currentBet ?? 0);

  // First to act pre-flop
  const firstActorIdx = getFirstActorPreflop(newPlayers, dealerIdx);

  return {
    ...state,
    players: newPlayers,
    deck: remainingDeck,
    communityCards: [],
    pot,
    sidePots: [],
    bettingRound: 'preflop',
    handPhase: 'betting',
    gamePhase: 'playing',
    currentPlayerIdx: firstActorIdx ?? 0,
    dealerIdx,
    bigBlind,
    smallBlind,
    lastRaiseAmount: bigBlind,
    minRaise: bigBlind,
    handNumber: state.handNumber + 1,
    winner: null,
    showdownResult: null,
  };
}

// ---- Advance betting round ----

function advanceBettingRound(state: HoldemState, ctx: GameContext): HoldemState {
  const { bettingRound, deck } = state;

  // Reset bets and hasActed for next round
  const players = state.players.map((p) => ({
    ...p,
    currentBet: 0,
    hasActed: false,
  }));

  let communityCards = [...state.communityCards];
  let newRound: BettingRound;
  let newDeck = [...deck];

  if (bettingRound === 'preflop') {
    // Deal flop: 3 cards
    communityCards = [...communityCards, ...newDeck.slice(0, 3)];
    newDeck = newDeck.slice(3);
    newRound = 'flop';
  } else if (bettingRound === 'flop') {
    communityCards = [...communityCards, newDeck[0] ?? 'As'];
    newDeck = newDeck.slice(1);
    newRound = 'turn';
  } else if (bettingRound === 'turn') {
    communityCards = [...communityCards, newDeck[0] ?? 'Kh'];
    newDeck = newDeck.slice(1);
    newRound = 'river';
  } else {
    // river -> showdown
    return resolveShowdown({ ...state, players }, ctx);
  }

  const firstActor = getFirstActorPostflop(players, state.dealerIdx);

  return {
    ...state,
    players,
    deck: newDeck,
    communityCards,
    bettingRound: newRound,
    handPhase: 'betting',
    currentPlayerIdx: firstActor ?? 0,
    minRaise: state.bigBlind,
    lastRaiseAmount: state.bigBlind,
    showdownResult: null,
  };
}

// ---- Showdown ----

function resolveShowdown(state: HoldemState, ctx: GameContext): HoldemState {
  const activePlayers = state.players.filter((p) => p.status === 'active' || p.status === 'all_in');

  // Build hole card map
  const holeMap = new Map<string, [string, string]>();
  for (const p of activePlayers) {
    if (p.holeCards) holeMap.set(p.id, p.holeCards);
  }

  const sidePots = calculateSidePots(state.players);
  const totalPot = sidePots.reduce((s, p) => s + p.amount, 0);
  // If side pots don't sum to pot (rounding), use pot directly for single pot case
  const effectivePots =
    sidePots.length > 0
      ? sidePots
      : [{ amount: state.pot, eligiblePlayerIds: activePlayers.map((p) => p.id) }];

  const winners = determineShowdownWinners(effectivePots, holeMap, state.communityCards);

  // Award chips
  const newPlayers = state.players.map((p) => {
    const won = winners.find((w) => w.playerId === p.id);
    return { ...p, chips: p.chips + (won?.amount ?? 0) };
  });

  const showdownResult = winners.map((w) => ({
    playerId: w.playerId,
    handName: w.handName,
    amount: w.amount,
  }));

  // Check if game over (1 player left with chips, or hand limit)
  const playersWithChips = newPlayers.filter((p) => p.chips > 0);
  const MAX_HANDS = 20;

  let gamePhase: 'playing' | 'finished' = 'playing';
  let winner: string | null = null;

  if (playersWithChips.length <= 1 || state.handNumber >= MAX_HANDS) {
    gamePhase = 'finished';
    winner = playersWithChips[0]?.id ?? newPlayers.sort((a, b) => b.chips - a.chips)[0]?.id ?? null;
  }

  const updatedState: HoldemState = {
    ...state,
    players: newPlayers,
    pot: 0,
    sidePots: [],
    handPhase: 'showdown',
    gamePhase,
    winner,
    showdownResult,
  };

  if (gamePhase === 'finished') {
    return updatedState;
  }

  // Auto-start next hand after a brief showing of showdown
  // In the plugin model we return the showdown state; the engine won't auto-advance.
  // We'll mark handPhase as 'hand_over' to signal the Board that the hand ended.
  // The next hand starts on first action (or we can auto-advance here).
  // For simplicity: auto-start next hand immediately.
  return dealNewHand(
    { ...updatedState, handPhase: 'hand_over', dealerIdx: updatedState.dealerIdx },
    ctx,
  );
}

// ---- Early win (all but one folded) ----

function resolveEarlyWin(state: HoldemState, winnerId: string, ctx: GameContext): HoldemState {
  const newPlayers = state.players.map((p) => {
    if (p.id === winnerId) return { ...p, chips: p.chips + state.pot };
    return p;
  });

  const playersWithChips = newPlayers.filter((p) => p.chips > 0);
  const MAX_HANDS = 20;

  let gamePhase: 'playing' | 'finished' = 'playing';
  let winner: string | null = null;

  if (playersWithChips.length <= 1 || state.handNumber >= MAX_HANDS) {
    gamePhase = 'finished';
    winner = playersWithChips[0]?.id ?? newPlayers.sort((a, b) => b.chips - a.chips)[0]?.id ?? null;
  }

  const showdownResult = [{ playerId: winnerId, handName: '其他玩家弃牌', amount: state.pot }];

  const updatedState: HoldemState = {
    ...state,
    players: newPlayers,
    pot: 0,
    sidePots: [],
    handPhase: 'hand_over',
    gamePhase,
    winner,
    showdownResult,
  };

  if (gamePhase === 'finished') {
    return updatedState;
  }

  return dealNewHand({ ...updatedState, dealerIdx: state.dealerIdx }, ctx);
}

// ---- GameLogic export ----

export const logic: GameLogic<HoldemState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): HoldemState {
    const STARTING_CHIPS = 1000;

    const initialState: HoldemState = {
      players: ctx.players.map((id) => ({
        id,
        chips: STARTING_CHIPS,
        holeCards: null,
        currentBet: 0,
        totalBetThisHand: 0,
        hasActed: false,
        status: 'active',
      })),
      deck: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      bettingRound: 'preflop',
      handPhase: 'betting',
      gamePhase: 'playing',
      currentPlayerIdx: 0,
      dealerIdx: -1, // will be set to 0 after dealNewHand advances
      bigBlind: 20,
      smallBlind: 10,
      lastRaiseAmount: 20,
      minRaise: 20,
      handNumber: 0,
      winner: null,
      showdownResult: null,
    };

    return dealNewHand(initialState, ctx);
  },

  onAction(state, action, playerID, ctx): ActionResult<HoldemState> {
    if (state.gamePhase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }
    if (state.handPhase !== 'betting') {
      return { ok: false, reason: '当前不在下注阶段' };
    }

    const currentPlayer = state.players[state.currentPlayerIdx];
    if (!currentPlayer || currentPlayer.id !== playerID) {
      return { ok: false, reason: '还没轮到你' };
    }
    if (currentPlayer.status !== 'active') {
      return { ok: false, reason: '你无法行动' };
    }

    const highestBet = Math.max(...state.players.map((p) => p.currentBet));
    const callAmount = highestBet - currentPlayer.currentBet;

    let newPlayers = [...state.players];
    let newPot = state.pot;
    let newMinRaise = state.minRaise;
    let newLastRaise = state.lastRaiseAmount;

    let actionLog: EngineEvent | undefined;

    switch (action.type) {
      case 'fold': {
        newPlayers = newPlayers.map((p) =>
          p.id === playerID ? { ...p, status: 'folded', holeCards: null, hasActed: true } : p,
        );
        actionLog = logAction(playerID, 'log.fold');
        break;
      }

      case 'check': {
        if (callAmount > 0) {
          return { ok: false, reason: `需要跟注 ${callAmount}，不能过牌` };
        }
        newPlayers = newPlayers.map((p) => (p.id === playerID ? { ...p, hasActed: true } : p));
        actionLog = logAction(playerID, 'log.check');
        break;
      }

      case 'call': {
        if (callAmount <= 0) {
          // treat as check
          newPlayers = newPlayers.map((p) => (p.id === playerID ? { ...p, hasActed: true } : p));
          actionLog = logAction(playerID, 'log.check');
          break;
        }
        const actualCall = Math.min(callAmount, currentPlayer.chips);
        const newChips = currentPlayer.chips - actualCall;
        newPot = newPot + actualCall;
        newPlayers = newPlayers.map((p) =>
          p.id === playerID
            ? {
                ...p,
                chips: newChips,
                currentBet: p.currentBet + actualCall,
                totalBetThisHand: p.totalBetThisHand + actualCall,
                hasActed: true,
                status: newChips === 0 ? 'all_in' : 'active',
              }
            : p,
        );
        actionLog = logAction(playerID, 'log.call', { amount: actualCall });
        break;
      }

      case 'raise': {
        const raiseTotal = action.amount; // total bet amount after raise
        const minTotal = highestBet + state.minRaise;
        if (raiseTotal < minTotal && raiseTotal < currentPlayer.chips + currentPlayer.currentBet) {
          return { ok: false, reason: `最小加注到 ${minTotal}` };
        }
        const additional = raiseTotal - currentPlayer.currentBet;
        if (additional > currentPlayer.chips) {
          return { ok: false, reason: '筹码不足' };
        }
        const raiseIncrement = raiseTotal - highestBet;
        newLastRaise = raiseIncrement;
        newMinRaise = raiseIncrement;
        newPot = newPot + additional;
        newPlayers = newPlayers.map((p) => {
          if (p.id === playerID) {
            const newChips = p.chips - additional;
            return {
              ...p,
              chips: newChips,
              currentBet: raiseTotal,
              totalBetThisHand: p.totalBetThisHand + additional,
              hasActed: true,
              status: newChips === 0 ? 'all_in' : 'active',
            };
          }
          // Others need to act again
          return p.status === 'active' && p.id !== playerID ? { ...p, hasActed: false } : p;
        });
        actionLog = logAction(playerID, 'log.raise', { amount: raiseTotal });
        break;
      }

      case 'all_in': {
        const allInAmount = currentPlayer.chips;
        if (allInAmount <= 0) return { ok: false, reason: '没有筹码' };
        const newTotalBet = currentPlayer.currentBet + allInAmount;
        const raiseIncrement = newTotalBet - highestBet;
        if (raiseIncrement > 0) {
          newLastRaise = raiseIncrement;
          newMinRaise = Math.max(raiseIncrement, state.minRaise);
          // Others need to act again
          newPlayers = newPlayers.map((p) => {
            if (p.id === playerID) {
              return {
                ...p,
                chips: 0,
                currentBet: newTotalBet,
                totalBetThisHand: p.totalBetThisHand + allInAmount,
                hasActed: true,
                status: 'all_in',
              };
            }
            return p.status === 'active' ? { ...p, hasActed: false } : p;
          });
        } else {
          newPlayers = newPlayers.map((p) =>
            p.id === playerID
              ? {
                  ...p,
                  chips: 0,
                  currentBet: newTotalBet,
                  totalBetThisHand: p.totalBetThisHand + allInAmount,
                  hasActed: true,
                  status: 'all_in',
                }
              : p,
          );
        }
        newPot = newPot + allInAmount;
        actionLog = logAction(playerID, 'log.allIn', { amount: allInAmount });
        break;
      }
    }

    let newState: HoldemState = {
      ...state,
      players: newPlayers,
      pot: newPot,
      minRaise: newMinRaise,
      lastRaiseAmount: newLastRaise,
    };

    // Check if only one player remains in hand
    const inHand = newState.players.filter((p) => p.status === 'active' || p.status === 'all_in');
    const activePlayers = newState.players.filter((p) => p.status === 'active');

    if (inHand.length <= 1 && activePlayers.length === 0) {
      // Last one standing — they win
      const winnerPlayer =
        inHand[0] ??
        newState.players.find((p) => p.status !== 'folded' && p.status !== 'eliminated');
      if (winnerPlayer) {
        const finalState = resolveEarlyWin(newState, winnerPlayer.id, ctx);
        return buildResult(finalState, actionLog);
      }
    }

    // Only active players can still bet?
    const canSomeoneAct = newState.players.some((p) => p.status === 'active');

    if (!canSomeoneAct || isBettingComplete(newState.players)) {
      if (inHand.length === 1) {
        const winnerPlayer = inHand[0];
        if (winnerPlayer) {
          const finalState = resolveEarlyWin(newState, winnerPlayer.id, ctx);
          return buildResult(finalState, actionLog);
        }
      }
      // Advance to next round
      const advanced = advanceBettingRound(newState, ctx);
      return buildResult(advanced, actionLog);
    }

    // Find next active player
    const nextActive = getNextActivePlayerIdx(newState.players, newState.currentPlayerIdx);
    if (nextActive === null) {
      const advanced = advanceBettingRound(newState, ctx);
      return buildResult(advanced, actionLog);
    }

    newState = { ...newState, currentPlayerIdx: nextActive };
    return buildResult(newState, actionLog);
  },

  getPlayerView(state, playerID): PlayerView {
    const isShowdown = state.handPhase === 'showdown' || state.handPhase === 'hand_over';

    const players = state.players.map((p) => ({
      id: p.id,
      chips: p.chips,
      currentBet: p.currentBet,
      status: p.status,
      cardCount: p.holeCards ? 2 : 0,
      holeCards: p.id === playerID ? p.holeCards : isShowdown ? p.holeCards : null,
    }));

    const me = state.players.find((p) => p.id === playerID);

    return {
      myHoleCards: me?.holeCards ?? null,
      communityCards: state.communityCards,
      pot: state.pot,
      players,
      currentPlayer: state.players[state.currentPlayerIdx]?.id ?? '',
      bettingRound: state.bettingRound,
      handPhase: state.handPhase,
      gamePhase: state.gamePhase,
      bigBlind: state.bigBlind,
      minRaise: state.minRaise,
      myChips: me?.chips ?? 0,
      myCurrentBet: me?.currentBet ?? 0,
      winner: state.winner,
      handNumber: state.handNumber,
      dealerIdx: state.dealerIdx,
      showdownResult: state.showdownResult,
    };
  },
};

function buildResult(state: HoldemState, actionLog?: EngineEvent): ActionResult<HoldemState> {
  const events: EngineEvent[] = [];

  if (actionLog) events.push(actionLog);

  if (state.gamePhase === 'finished' && state.winner) {
    const rankings = [...state.players].sort((a, b) => b.chips - a.chips).map((p) => p.id);
    events.push(logSystem('log.win', { actorId: state.winner }));
    events.push({ type: 'END_GAME', rankings });
  }

  return { ok: true, state, events };
}
