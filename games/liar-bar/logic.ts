import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import { type Action, ActionSchema, type Card, type PlayerView, type Suit } from './shared';

// ---- Internal State ----

interface PlayerState {
  id: string;
  hand: Card[];
  alive: boolean;
  revolverChamber: number; // how many times fired (0-5)
  revolverBullet: number; // bullet position 0-5 (hidden from clients)
}

interface ChallengeResult {
  playedCards: Card[];
  wasLying: boolean;
  shooterId: string;
  shotDied: boolean;
  shotChamberIndex: number;
}

interface LiarsBarState {
  players: PlayerState[];
  turnOrder: string[]; // alive player IDs in order
  currentPlayerIdx: number; // index into turnOrder
  declaredSuit: Suit;
  phase: 'playing' | 'challenging' | 'finished';
  lastPlay: { playerId: string; cards: Card[]; count: number } | null;
  winner: string | null;
  challengeResult: ChallengeResult | null;
}

// ---- Deck ----

const FULL_DECK: Card[] = [
  'Q',
  'Q',
  'Q',
  'Q',
  'Q',
  'Q',
  'K',
  'K',
  'K',
  'K',
  'K',
  'K',
  'A',
  'A',
  'A',
  'A',
  'A',
  'A',
  'Joker',
  'Joker',
];

const HAND_SIZE = 5;
const REVOLVER_CHAMBERS = 6;
const SUITS: Suit[] = ['Q', 'K', 'A'];

// ---- Helpers ----

function getAlivePlayers(state: LiarsBarState): PlayerState[] {
  return state.players.filter((p) => p.alive);
}

function getPlayerState(state: LiarsBarState, id: string): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Player not found: ${id}`);
  return p;
}

function rebuildTurnOrder(state: LiarsBarState): string[] {
  return state.players.filter((p) => p.alive).map((p) => p.id);
}

function dealCards(state: LiarsBarState, ctx: GameContext): LiarsBarState {
  const deck = ctx.random.shuffle([...FULL_DECK]);
  let deckPos = 0;
  const newPlayers = state.players.map((p) => {
    if (!p.alive) return p;
    const hand: Card[] = [];
    for (let i = 0; i < HAND_SIZE && deckPos < deck.length; i++) {
      hand.push(deck[deckPos++]);
    }
    return { ...p, hand };
  });
  return { ...state, players: newPlayers };
}

function pullTrigger(
  state: LiarsBarState,
  shooterId: string,
): { newState: LiarsBarState; died: boolean; chamberIndex: number } {
  const playerIdx = state.players.findIndex((p) => p.id === shooterId);
  const player = state.players[playerIdx];
  const chamberIndex = player.revolverChamber;
  const fired = chamberIndex === player.revolverBullet;
  const newChamber = (chamberIndex + 1) % REVOLVER_CHAMBERS;

  const updatedPlayer = {
    ...player,
    revolverChamber: newChamber,
    alive: fired ? false : player.alive,
  };

  const newPlayers = state.players.map((p, i) => (i === playerIdx ? updatedPlayer : p));
  return {
    newState: { ...state, players: newPlayers },
    died: fired,
    chamberIndex,
  };
}

function checkAndReshuffleIfNeeded(state: LiarsBarState, ctx: GameContext): LiarsBarState {
  const alivePlayers = getAlivePlayers(state);
  const allEmpty = alivePlayers.every((p) => p.hand.length === 0);
  if (allEmpty) {
    // Reshuffle and redeal
    const newSuitIdx = ctx.random.int(0, 2);
    let newState = dealCards(state, ctx);
    newState = { ...newState, declaredSuit: SUITS[newSuitIdx] };
    return newState;
  }
  return state;
}

// ---- Logic ----

export const logic: GameLogic<LiarsBarState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): LiarsBarState {
    const players: PlayerState[] = ctx.players.map((id) => ({
      id,
      hand: [],
      alive: true,
      revolverChamber: 0,
      revolverBullet: ctx.random.int(0, REVOLVER_CHAMBERS - 1),
    }));

    const turnOrder = ctx.players.slice();
    const suitIdx = ctx.random.int(0, 2);

    let state: LiarsBarState = {
      players,
      turnOrder,
      currentPlayerIdx: 0,
      declaredSuit: SUITS[suitIdx],
      phase: 'playing',
      lastPlay: null,
      winner: null,
      challengeResult: null,
    };

    state = dealCards(state, ctx);
    return state;
  },

  onAction(state, action, playerID, ctx): ActionResult<LiarsBarState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }

    const currentPlayer = state.turnOrder[state.currentPlayerIdx];

    if (action.type === 'play_cards') {
      // Must be current player's turn in playing phase
      if (state.phase !== 'playing') {
        return { ok: false, reason: '当前阶段不能出牌' };
      }
      if (playerID !== currentPlayer) {
        return { ok: false, reason: '还没轮到你' };
      }

      const player = getPlayerState(state, playerID);
      const { cardIndices } = action;

      // Validate indices
      if (cardIndices.some((i) => i < 0 || i >= player.hand.length)) {
        return { ok: false, reason: '无效的牌索引' };
      }
      // No duplicates
      const uniqueIndices = new Set(cardIndices);
      if (uniqueIndices.size !== cardIndices.length) {
        return { ok: false, reason: '不能重复选牌' };
      }

      const playedCards = cardIndices.map((i) => player.hand[i]);
      const remainingHand = player.hand.filter((_, i) => !uniqueIndices.has(i));

      const newPlayers = state.players.map((p) =>
        p.id === playerID ? { ...p, hand: remainingHand } : p,
      );

      const newState: LiarsBarState = {
        ...state,
        players: newPlayers,
        phase: 'challenging',
        lastPlay: {
          playerId: playerID,
          cards: playedCards,
          count: playedCards.length,
        },
        challengeResult: null,
      };

      return {
        ok: true,
        state: newState,
        events: [
          logAction(playerID, 'log.playCards', {
            count: playedCards.length,
            suit: state.declaredSuit,
          }),
        ],
      };
    }

    if (action.type === 'challenge' || action.type === 'believe') {
      if (state.phase !== 'challenging') {
        return { ok: false, reason: '当前阶段不能质疑或相信' };
      }
      if (!state.lastPlay) {
        return { ok: false, reason: '没有可以质疑的出牌' };
      }

      // The next alive player after the one who played must make this decision
      const lastPlayerId = state.lastPlay.playerId;
      const lastPlayerTurnIdx = state.turnOrder.indexOf(lastPlayerId);
      const deciderIdx = (lastPlayerTurnIdx + 1) % state.turnOrder.length;
      const deciderId = state.turnOrder[deciderIdx];

      if (playerID !== deciderId) {
        return { ok: false, reason: '还没轮到你决定' };
      }

      if (action.type === 'believe') {
        // Next player's turn (the decider becomes the next to play)
        let newState: LiarsBarState = {
          ...state,
          currentPlayerIdx: deciderIdx,
          phase: 'playing',
          challengeResult: null,
        };

        // Check if decider has no cards - reshuffle if needed
        newState = checkAndReshuffleIfNeeded(newState, ctx);

        return {
          ok: true,
          state: newState,
          events: [logAction(playerID, 'log.believe', { target: lastPlayerId })],
        };
      }

      // challenge
      const { cards } = state.lastPlay;
      const wasLying = cards.some((c) => c !== state.declaredSuit && c !== 'Joker');

      // Shooter is the one who was wrong
      const shooterId = wasLying ? lastPlayerId : playerID;

      const { newState: afterShot, died, chamberIndex } = pullTrigger(state, shooterId);

      const events: EngineEvent[] = [];

      events.push(
        logSystem('log.challengeResult', {
          actorId: playerID,
          messageParams: {
            target: lastPlayerId,
            wasLying,
            shooterId,
            died,
            chamberIndex: chamberIndex + 1,
          },
        }),
      );

      const challengeResult: ChallengeResult = {
        playedCards: cards,
        wasLying,
        shooterId,
        shotDied: died,
        shotChamberIndex: chamberIndex,
      };

      let newState: LiarsBarState = {
        ...afterShot,
        challengeResult,
        phase: 'playing',
        lastPlay: null,
      };

      // Rebuild turn order (remove dead players)
      const newTurnOrder = rebuildTurnOrder(newState);

      // Check win condition
      const alivePlayers = getAlivePlayers(newState);
      if (alivePlayers.length === 1) {
        const winner = alivePlayers[0].id;
        const rankings = [winner, ...state.players.filter((p) => p.id !== winner).map((p) => p.id)];
        newState = { ...newState, winner, phase: 'finished', turnOrder: newTurnOrder };
        events.push(logSystem('log.win', { actorId: winner }));
        events.push({ type: 'END_GAME', rankings });
        return { ok: true, state: newState, events };
      }

      if (alivePlayers.length === 0) {
        // Edge case: everyone dies simultaneously (shouldn't happen in practice)
        const rankings = state.players.map((p) => p.id);
        newState = { ...newState, phase: 'finished', turnOrder: newTurnOrder };
        events.push({ type: 'END_GAME', rankings });
        return { ok: true, state: newState, events };
      }

      // Determine who plays next after a challenge
      // The player after the shooter (or the last player who played if shooter died)
      let nextPlayerId: string = newTurnOrder[0];
      if (died) {
        // Shooter is eliminated, next alive player after them in the new order
        // We find the shooter's position in OLD turn order and pick next alive
        const shooterOldIdx = state.turnOrder.indexOf(shooterId);
        let found = false;
        for (let offset = 1; offset <= state.turnOrder.length; offset++) {
          const candidateId = state.turnOrder[(shooterOldIdx + offset) % state.turnOrder.length];
          if (newTurnOrder.includes(candidateId)) {
            nextPlayerId = candidateId;
            found = true;
            break;
          }
        }
        if (!found) nextPlayerId = newTurnOrder[0];
      } else {
        // Shooter survived, they play next
        nextPlayerId = shooterId;
      }

      const nextIdx = newTurnOrder.indexOf(nextPlayerId);
      newState = {
        ...newState,
        turnOrder: newTurnOrder,
        currentPlayerIdx: nextIdx >= 0 ? nextIdx : 0,
      };

      // Check if reshuffle needed
      newState = checkAndReshuffleIfNeeded(newState, ctx);

      return { ok: true, state: newState, events };
    }

    return { ok: false, reason: '未知动作' };
  },

  getPlayerView(state, playerID): PlayerView {
    const myPlayerState = state.players.find((p) => p.id === playerID);
    return {
      myHand: myPlayerState?.hand ?? [],
      players: state.players.map((p) => ({
        id: p.id,
        alive: p.alive,
        cardCount: p.hand.length,
        revolverChamber: p.revolverChamber,
      })),
      currentPlayer: state.turnOrder[state.currentPlayerIdx] ?? '',
      declaredSuit: state.declaredSuit,
      phase: state.phase,
      lastPlay: state.lastPlay
        ? { playerId: state.lastPlay.playerId, count: state.lastPlay.count }
        : null,
      winner: state.winner,
      challengeResult: state.challengeResult,
    };
  },

  getSpectatorView(state): PlayerView {
    return {
      myHand: [],
      players: state.players.map((p) => ({
        id: p.id,
        alive: p.alive,
        cardCount: p.hand.length,
        revolverChamber: p.revolverChamber,
      })),
      currentPlayer: state.turnOrder[state.currentPlayerIdx] ?? '',
      declaredSuit: state.declaredSuit,
      phase: state.phase,
      lastPlay: state.lastPlay
        ? { playerId: state.lastPlay.playerId, count: state.lastPlay.count }
        : null,
      winner: state.winner,
      challengeResult: state.challengeResult,
    };
  },
};
