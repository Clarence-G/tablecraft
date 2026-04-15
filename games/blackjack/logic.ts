import type { ActionResult, GameContext, GameLogic } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  type Card,
  MAX_ROUNDS,
  type Outcome,
  type PlayerView,
  STARTING_CHIPS,
  calculatePayout,
  createDeck,
  dealerShouldHit,
  determineOutcome,
  handTotal,
  isBusted,
} from './shared';

interface PlayerState {
  id: string;
  chips: number;
  bet: number;
  hand: Card[];
  stood: boolean;
  busted: boolean;
  outcome: Outcome;
}

interface BlackjackState {
  players: PlayerState[];
  dealerHand: Card[];
  dealerHidden: boolean;
  deck: Card[];
  phase: 'betting' | 'player_turns' | 'dealer_turn' | 'payout' | 'finished';
  currentPlayerIdx: number;
  round: number;
  winner: string | null;
}

function initPlayer(id: string): PlayerState {
  return {
    id,
    chips: STARTING_CHIPS,
    bet: 0,
    hand: [],
    stood: false,
    busted: false,
    outcome: 'pending',
  };
}

function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (card === undefined) {
    // Deck ran out — return a placeholder (shouldn't happen in normal play)
    return '2s';
  }
  return card;
}

function dealHands(state: BlackjackState): BlackjackState {
  const deck = [...state.deck];
  const players = state.players.map((p) => ({
    ...p,
    hand: [drawCard(deck), drawCard(deck)],
    stood: false,
    busted: false,
    outcome: 'pending' as Outcome,
  }));
  const dealerHand = [drawCard(deck), drawCard(deck)];

  return {
    ...state,
    deck,
    players,
    dealerHand,
    dealerHidden: true,
    phase: 'player_turns',
    currentPlayerIdx: 0,
  };
}

function advancePlayer(state: BlackjackState): BlackjackState {
  const next = state.players.findIndex(
    (p, i) => i > state.currentPlayerIdx && !p.busted && !p.stood,
  );
  if (next === -1) {
    // All players done — move to dealer turn
    return runDealerTurn({ ...state, phase: 'dealer_turn' });
  }
  return { ...state, currentPlayerIdx: next };
}

function runDealerTurn(state: BlackjackState): BlackjackState {
  const deck = [...state.deck];
  let dealerHand = [...state.dealerHand];

  while (dealerShouldHit(dealerHand)) {
    dealerHand = [...dealerHand, drawCard(deck)];
  }

  return runPayout({ ...state, deck, dealerHand, dealerHidden: false, phase: 'payout' });
}

function runPayout(state: BlackjackState): BlackjackState {
  const players = state.players.map((p) => {
    if (p.bet === 0) {
      // Player didn't bet — no change
      return { ...p, outcome: 'push' as Outcome };
    }
    const outcome = determineOutcome(p.hand, state.dealerHand);
    const payout = calculatePayout(outcome, p.bet);
    return { ...p, outcome, chips: p.chips + payout };
  });

  // Check game-end conditions
  const activePlayers = players.filter((p) => p.chips > 0);
  const isLastRound = state.round >= MAX_ROUNDS;
  const someoneEliminated = players.some((p) => p.chips <= 0);

  if (isLastRound || (someoneEliminated && activePlayers.length <= 1)) {
    const sorted = [...players].sort((a, b) => b.chips - a.chips);
    const winner = sorted[0].id;
    return {
      ...state,
      players,
      phase: 'finished',
      winner,
    };
  }

  // Continue to next round — reset bets
  const nextPlayers = players.map((p) => ({
    ...p,
    bet: 0,
    hand: [],
    outcome: 'pending' as Outcome,
  }));
  const deck = createDeck();

  return {
    ...state,
    players: nextPlayers,
    deck,
    dealerHand: [],
    dealerHidden: true,
    phase: 'betting',
    currentPlayerIdx: 0,
    round: state.round + 1,
    winner: null,
  };
}

export const logic: GameLogic<BlackjackState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): BlackjackState {
    const deck = createDeck();
    ctx.random.shuffle(deck);

    return {
      players: ctx.players.map(initPlayer),
      dealerHand: [],
      dealerHidden: true,
      deck,
      phase: 'betting',
      currentPlayerIdx: 0,
      round: 1,
      winner: null,
    };
  },

  onAction(state: BlackjackState, action: Action, playerID: string): ActionResult<BlackjackState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }

    const playerIdx = state.players.findIndex((p) => p.id === playerID);
    if (playerIdx === -1) {
      return { ok: false, reason: '找不到玩家' };
    }

    const player = state.players[playerIdx];

    // ---- BETTING phase ----
    if (action.type === 'bet') {
      if (state.phase !== 'betting') {
        return { ok: false, reason: '现在不是下注阶段' };
      }
      if (player.bet > 0) {
        return { ok: false, reason: '你已经下注了' };
      }
      if (action.amount > player.chips) {
        return { ok: false, reason: '筹码不足' };
      }

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, bet: action.amount, chips: p.chips - action.amount } : p,
      );

      // Check if all players have bet
      const allBet = newPlayers.every((p) => p.bet > 0);
      if (allBet) {
        const stateWithBets = { ...state, players: newPlayers };
        const deck = [...stateWithBets.deck];
        const dealt = dealHands({ ...stateWithBets, deck });
        return { ok: true, state: dealt };
      }

      return { ok: true, state: { ...state, players: newPlayers } };
    }

    // ---- PLAYER_TURNS phase ----
    if (state.phase !== 'player_turns') {
      return { ok: false, reason: '现在不是行动阶段' };
    }

    const currentPlayer = state.players[state.currentPlayerIdx];
    if (currentPlayer.id !== playerID) {
      return { ok: false, reason: '还没轮到你' };
    }

    if (action.type === 'hit') {
      const deck = [...state.deck];
      const card = drawCard(deck);
      const newHand = [...player.hand, card];
      const busted = isBusted(newHand);

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, hand: newHand, busted } : p,
      );

      const next = busted
        ? advancePlayer({ ...state, players: newPlayers, deck })
        : { ...state, players: newPlayers, deck };

      if (next.phase === 'finished') {
        const rankings = [...next.players].sort((a, b) => b.chips - a.chips).map((p) => p.id);
        return { ok: true, state: next, events: [{ type: 'END_GAME', rankings }] };
      }

      return { ok: true, state: next };
    }

    if (action.type === 'stand') {
      const newPlayers = state.players.map((p, i) => (i === playerIdx ? { ...p, stood: true } : p));
      const next = advancePlayer({ ...state, players: newPlayers });

      if (next.phase === 'finished') {
        const rankings = [...next.players].sort((a, b) => b.chips - a.chips).map((p) => p.id);
        return { ok: true, state: next, events: [{ type: 'END_GAME', rankings }] };
      }

      return { ok: true, state: next };
    }

    if (action.type === 'double_down') {
      if (player.hand.length !== 2) {
        return { ok: false, reason: '只能在前两张牌时加倍' };
      }
      if (player.chips < player.bet) {
        return { ok: false, reason: '筹码不足以加倍' };
      }

      const deck = [...state.deck];
      const card = drawCard(deck);
      const newHand = [...player.hand, card];
      const busted = isBusted(newHand);
      const extraBet = player.bet;

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx
          ? { ...p, hand: newHand, busted, stood: true, bet: p.bet * 2, chips: p.chips - extraBet }
          : p,
      );

      const next = advancePlayer({ ...state, players: newPlayers, deck });

      if (next.phase === 'finished') {
        const rankings = [...next.players].sort((a, b) => b.chips - a.chips).map((p) => p.id);
        return { ok: true, state: next, events: [{ type: 'END_GAME', rankings }] };
      }

      return { ok: true, state: next };
    }

    return { ok: false, reason: '未知操作' };
  },

  getPlayerView(state: BlackjackState, playerID: string): PlayerView {
    const player = state.players.find((p) => p.id === playerID);
    const myHand = player ? player.hand : [];
    const myTotal = handTotal(myHand);

    const dealerHand =
      state.dealerHidden && state.dealerHand.length >= 2
        ? [state.dealerHand[0], 'hidden']
        : state.dealerHand;

    const dealerTotal =
      state.dealerHidden && state.dealerHand.length >= 2 ? 0 : handTotal(state.dealerHand);

    const currentPlayer =
      state.phase === 'player_turns' && state.currentPlayerIdx < state.players.length
        ? state.players[state.currentPlayerIdx].id
        : '';

    const players = state.players.map((p) => ({
      id: p.id,
      chips: p.chips,
      bet: p.bet,
      cardCount: p.hand.length,
      hand: p.id === playerID ? p.hand : [],
      stood: p.stood,
      busted: p.busted,
      outcome: p.outcome,
    }));

    return {
      myHand,
      dealerHand,
      dealerHiddenCard: state.dealerHidden,
      players,
      currentPlayer,
      phase: state.phase,
      myTotal,
      dealerTotal,
      winner: state.winner,
      round: state.round,
    };
  },

  getSpectatorView(state: BlackjackState): PlayerView {
    const dealerHand =
      state.dealerHidden && state.dealerHand.length >= 2
        ? [state.dealerHand[0], 'hidden']
        : state.dealerHand;

    const dealerTotal =
      state.dealerHidden && state.dealerHand.length >= 2 ? 0 : handTotal(state.dealerHand);

    const currentPlayer =
      state.phase === 'player_turns' && state.currentPlayerIdx < state.players.length
        ? state.players[state.currentPlayerIdx].id
        : '';

    const players = state.players.map((p) => ({
      id: p.id,
      chips: p.chips,
      bet: p.bet,
      cardCount: p.hand.length,
      hand: [],
      stood: p.stood,
      busted: p.busted,
      outcome: p.outcome,
    }));

    return {
      myHand: [],
      dealerHand,
      dealerHiddenCard: state.dealerHidden,
      players,
      currentPlayer,
      phase: state.phase,
      myTotal: 0,
      dealerTotal,
      winner: state.winner,
      round: state.round,
    };
  },
};
