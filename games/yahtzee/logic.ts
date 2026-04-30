import { type ActionResult, type GameContext, type GameLogic, logAction, logSystem } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  MAX_ROLLS,
  NUM_CATEGORIES,
  NUM_DICE,
  type PlayerView,
  allCategoriesFilled,
  calculateScore,
  calculateTotalScore,
} from './shared';

interface PlayerYahtzeeState {
  id: string;
  scores: number[]; // length 13, -1 = not filled
  yahtzeeBonus: number;
}

interface YahtzeeState {
  players: PlayerYahtzeeState[];
  turnOrder: string[];
  currentPlayerIdx: number;
  dice: number[]; // 5 dice, 0 = unrolled
  heldDice: boolean[];
  rollsLeft: number; // starts at MAX_ROLLS, decrements per roll
  roundNumber: number; // 1-13
  phase: 'rolling' | 'scoring' | 'finished';
  winner: string | null;
}

function initPlayerState(id: string): PlayerYahtzeeState {
  return {
    id,
    scores: Array(NUM_CATEGORIES).fill(-1),
    yahtzeeBonus: 0,
  };
}

function rollAllDice(ctx: GameContext): number[] {
  return Array.from({ length: NUM_DICE }, () => ctx.random.int(1, 6));
}

function hasRolled(state: YahtzeeState): boolean {
  return state.rollsLeft < MAX_ROLLS;
}

export const logic: GameLogic<YahtzeeState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): YahtzeeState {
    // Auto-roll for the first player so the turn starts with dice on the table
    // — saves a redundant click since every turn always begins with a roll.
    return {
      players: ctx.players.map(initPlayerState),
      turnOrder: ctx.players,
      currentPlayerIdx: 0,
      dice: rollAllDice(ctx),
      heldDice: Array(NUM_DICE).fill(false),
      rollsLeft: MAX_ROLLS - 1,
      roundNumber: 1,
      phase: 'scoring',
      winner: null,
    };
  },

  onAction(state, action, playerID, ctx): ActionResult<YahtzeeState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }

    const currentPlayerID = state.turnOrder[state.currentPlayerIdx];

    if (action.type === 'roll') {
      if (playerID !== currentPlayerID) {
        return { ok: false, reason: '还没轮到你' };
      }
      if (state.rollsLeft <= 0) {
        return { ok: false, reason: '本轮已用完投掷次数，请选择计分' };
      }

      const newDice = state.dice.map((d, i) => {
        if (state.heldDice[i]) return d;
        return ctx.random.int(1, 6);
      });

      const newRollsLeft = state.rollsLeft - 1;

      return {
        ok: true,
        state: {
          ...state,
          dice: newDice,
          rollsLeft: newRollsLeft,
          phase: 'scoring',
        },
        events: [
          logAction(playerID, 'log.roll', { dice: newDice.join(' '), rolls: newRollsLeft }),
        ],
      };
    }

    if (action.type === 'hold') {
      if (playerID !== currentPlayerID) {
        return { ok: false, reason: '还没轮到你' };
      }
      if (!hasRolled(state)) {
        return { ok: false, reason: '请先投掷骰子' };
      }
      if (state.rollsLeft <= 0) {
        return { ok: false, reason: '已无剩余投掷次数' };
      }

      const { diceIndex } = action;
      const newHeld = [...state.heldDice];
      newHeld[diceIndex] = !newHeld[diceIndex];

      return {
        ok: true,
        state: { ...state, heldDice: newHeld },
      };
    }

    if (action.type === 'score') {
      if (playerID !== currentPlayerID) {
        return { ok: false, reason: '还没轮到你' };
      }
      if (!hasRolled(state)) {
        return { ok: false, reason: '请先投掷骰子' };
      }

      const { category } = action;
      const playerStateIdx = state.players.findIndex((p) => p.id === playerID);
      if (playerStateIdx === -1) {
        return { ok: false, reason: '玩家不存在' };
      }

      const playerState = state.players[playerStateIdx];
      if (playerState.scores[category] >= 0) {
        return { ok: false, reason: '该分类已填写' };
      }

      const score = calculateScore(category, state.dice);
      const newScores = [...playerState.scores];
      newScores[category] = score;

      // Check for Yahtzee bonus (cat 11, already has 50, scoring again)
      let newYahtzeeBonus = playerState.yahtzeeBonus;
      if (category === 11 && playerState.scores[11] === 50) {
        // This case shouldn't happen (already filled), but guard anyway
        newYahtzeeBonus += 1;
      }
      // If player scores yahtzee (cat 11 = 50) when cat 11 already filled, that's handled above
      // Extra yahtzee bonus: when cat 11 is already filled (50) and current roll is yahtzee
      // The player must score somewhere else; we grant +100 regardless of where they score
      const isYahtzee = state.dice.every((d) => d === state.dice[0] && d > 0);
      if (isYahtzee && category !== 11 && playerState.scores[11] === 50) {
        newYahtzeeBonus += 1;
      }

      const newPlayers = state.players.map((p, i) => {
        if (i !== playerStateIdx) return p;
        return { ...p, scores: newScores, yahtzeeBonus: newYahtzeeBonus };
      });

      // Advance to next player
      const nextPlayerIdx = (state.currentPlayerIdx + 1) % state.turnOrder.length;
      const completedFullRound = nextPlayerIdx === 0;
      const newRoundNumber = completedFullRound ? state.roundNumber + 1 : state.roundNumber;

      // Check if game is over: all players have filled all categories
      const allDone = newPlayers.every((p) => allCategoriesFilled(p.scores));

      if (allDone || newRoundNumber > 13) {
        // Find winner
        let bestScore = -1;
        let winnerID: string | null = null;
        for (const p of newPlayers) {
          const total = calculateTotalScore(p.scores, p.yahtzeeBonus);
          if (total > bestScore) {
            bestScore = total;
            winnerID = p.id;
          }
        }

        const rankings = [...newPlayers]
          .sort((a, b) => {
            return (
              calculateTotalScore(b.scores, b.yahtzeeBonus) -
              calculateTotalScore(a.scores, a.yahtzeeBonus)
            );
          })
          .map((p) => p.id);

        const scoreEvents = [
          logAction(
            playerID,
            score === 0 ? 'log.zeroScore' : 'log.score',
            { category, score },
          ),
        ];
        if (newYahtzeeBonus > playerState.yahtzeeBonus) {
          scoreEvents.push(logAction(playerID, 'log.yahtzeeBonus'));
        }

        return {
          ok: true,
          state: {
            ...state,
            players: newPlayers,
            phase: 'finished',
            winner: winnerID,
            dice: Array(NUM_DICE).fill(0),
            heldDice: Array(NUM_DICE).fill(false),
            rollsLeft: MAX_ROLLS,
          },
          events: [
            ...scoreEvents,
            logSystem('log.win', { actorId: winnerID! }),
            { type: 'END_GAME', rankings },
          ],
        };
      }

      const scoreEvents = [
        logAction(
          playerID,
          score === 0 ? 'log.zeroScore' : 'log.score',
          { category, score },
        ),
      ];
      if (newYahtzeeBonus > playerState.yahtzeeBonus) {
        scoreEvents.push(logAction(playerID, 'log.yahtzeeBonus'));
      }

      return {
        ok: true,
        state: {
          ...state,
          players: newPlayers,
          currentPlayerIdx: nextPlayerIdx,
          roundNumber: newRoundNumber,
          dice: rollAllDice(ctx),
          heldDice: Array(NUM_DICE).fill(false),
          rollsLeft: MAX_ROLLS - 1,
          phase: 'scoring',
        },
        events: scoreEvents,
      };
    }

    return { ok: false, reason: '未知操作' };
  },

  getPlayerView(state, _playerID): PlayerView {
    return {
      dice: state.dice,
      heldDice: state.heldDice,
      rollsLeft: state.rollsLeft,
      roundNumber: state.roundNumber,
      currentPlayer: state.turnOrder[state.currentPlayerIdx],
      phase: state.phase,
      players: state.players.map((p) => ({
        id: p.id,
        scores: p.scores,
        yahtzeeBonus: p.yahtzeeBonus,
        totalScore: calculateTotalScore(p.scores, p.yahtzeeBonus),
      })),
      winner: state.winner,
    };
  },
};
