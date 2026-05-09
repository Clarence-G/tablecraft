import {
  type ActionResult,
  type GameContext,
  type GameLogic,
  logAction,
  logSystem,
} from '@repo/shared';
import {
  type Action,
  ActionSchema,
  BATTLESHIP_DEFAULT_CONFIG,
  type BattleshipConfig,
  BattleshipConfigSchema,
  FAST_MODE_SHOTS_PER_TURN,
  GRID_SIZE,
  type Phase,
  type PlayerView,
  type ShipDefinition,
  TOTAL_CELLS,
  buildFleet,
  checkAllShipsSunk,
  checkShipSunk,
  placeShipsOnGrid,
  toIndex,
  validateShipPlacements,
} from './shared';

interface PlayerBattleState {
  id: string;
  grid: number[];
  shots: number[];
  placed: boolean;
}

interface BattleshipState {
  players: [PlayerBattleState, PlayerBattleState];
  phase: Phase;
  currentPlayerIdx: number;
  /** Shots fired by the current player so far this turn (for fastMode). */
  shotsThisTurn: number;
  fastMode: boolean;
  /** Fleet definition for this match (classic or irregular, chosen from config). */
  fleet: ShipDefinition[];
  winner: string | null;
}

function emptyPlayerState(id: string): PlayerBattleState {
  return {
    id,
    grid: new Array(TOTAL_CELLS).fill(0),
    shots: new Array(TOTAL_CELLS).fill(0),
    placed: false,
  };
}

function parseConfig(raw: unknown): BattleshipConfig {
  const result = BattleshipConfigSchema.safeParse(raw);
  return result.success ? result.data : BATTLESHIP_DEFAULT_CONFIG;
}

function shotsPerTurn(fastMode: boolean): number {
  return fastMode ? FAST_MODE_SHOTS_PER_TURN : 1;
}

export const logic: GameLogic<BattleshipState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext, config?: unknown): BattleshipState {
    const parsed = parseConfig(config ?? ctx.config);
    return {
      players: [emptyPlayerState(ctx.players[0]), emptyPlayerState(ctx.players[1])],
      phase: 'placement',
      currentPlayerIdx: 0,
      shotsThisTurn: 0,
      fastMode: parsed.fastMode,
      fleet: buildFleet(parsed.irregularShips),
      winner: null,
    };
  },

  onAction(state, action, playerID): ActionResult<BattleshipState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: '游戏已结束' };
    }

    if (action.type === 'place_ships') {
      const playerIdx = state.players.findIndex((p) => p.id === playerID);
      if (playerIdx === -1) return { ok: false, reason: '非游戏玩家' };

      const player = state.players[playerIdx];
      if (player.placed) return { ok: false, reason: '你已经部署过舰船了' };

      if (!validateShipPlacements(action.placements, state.fleet)) {
        return { ok: false, reason: '舰船部署无效' };
      }

      const grid = placeShipsOnGrid(action.placements, state.fleet);
      if (!grid) return { ok: false, reason: '舰船部署无效' };

      const updatedPlayer: PlayerBattleState = { ...player, grid, placed: true };
      const newPlayers: [PlayerBattleState, PlayerBattleState] =
        playerIdx === 0 ? [updatedPlayer, state.players[1]] : [state.players[0], updatedPlayer];

      const bothPlaced = newPlayers[0].placed && newPlayers[1].placed;
      const newPhase: Phase = bothPlaced ? 'playing' : 'placement';

      return {
        ok: true,
        state: { ...state, players: newPlayers, phase: newPhase },
        events: [logAction(playerID, 'log.placeShips')],
      };
    }

    if (action.type === 'end_turn') {
      if (state.phase !== 'playing') {
        return { ok: false, reason: '战斗尚未开始' };
      }
      if (!state.fastMode) {
        return { ok: false, reason: '非快速模式，无法提前结束回合' };
      }
      const attackerIdx = state.players.findIndex((p) => p.id === playerID);
      if (attackerIdx === -1) return { ok: false, reason: '非游戏玩家' };
      if (attackerIdx !== state.currentPlayerIdx) return { ok: false, reason: '还没轮到你' };

      return {
        ok: true,
        state: {
          ...state,
          currentPlayerIdx: 1 - attackerIdx,
          shotsThisTurn: 0,
        },
        events: [logAction(playerID, 'log.endTurn')],
      };
    }

    if (action.type === 'fire') {
      if (state.phase !== 'playing') {
        return { ok: false, reason: '战斗尚未开始' };
      }

      const attackerIdx = state.players.findIndex((p) => p.id === playerID);
      if (attackerIdx === -1) return { ok: false, reason: '非游戏玩家' };
      if (attackerIdx !== state.currentPlayerIdx) return { ok: false, reason: '还没轮到你' };

      const { row, col } = action;
      const idx = toIndex(row, col);
      const attacker = state.players[attackerIdx];
      const defenderIdx = 1 - attackerIdx;
      const defender = state.players[defenderIdx];

      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
        return { ok: false, reason: '坐标超出范围' };
      }
      if (attacker.shots[idx] !== 0) {
        return { ok: false, reason: '该位置已经开炮过了' };
      }

      const cellValue = defender.grid[idx];
      const hit = cellValue > 0;
      const newShots = [...attacker.shots];
      newShots[idx] = hit ? 2 : 1;

      const updatedAttacker: PlayerBattleState = { ...attacker, shots: newShots };
      const newPlayers: [PlayerBattleState, PlayerBattleState] =
        attackerIdx === 0 ? [updatedAttacker, defender] : [defender, updatedAttacker];

      const fireLog = logAction(playerID, hit ? 'log.hit' : 'log.miss', {
        row: row + 1,
        col: col + 1,
      });

      if (checkAllShipsSunk(defender.grid, newShots, state.fleet.length)) {
        const loser = defender.id;
        return {
          ok: true,
          state: {
            ...state,
            players: newPlayers,
            phase: 'finished',
            winner: playerID,
            currentPlayerIdx: attackerIdx,
            shotsThisTurn: state.shotsThisTurn + 1,
          },
          events: [
            fireLog,
            logSystem('log.win', { actorId: playerID }),
            { type: 'END_GAME', rankings: [playerID, loser] },
          ],
        };
      }

      const newShotsThisTurn = state.shotsThisTurn + 1;
      const turnDone = newShotsThisTurn >= shotsPerTurn(state.fastMode);

      return {
        ok: true,
        state: {
          ...state,
          players: newPlayers,
          currentPlayerIdx: turnDone ? defenderIdx : attackerIdx,
          shotsThisTurn: turnDone ? 0 : newShotsThisTurn,
        },
        events: [fireLog],
      };
    }

    return { ok: false, reason: '未知操作' };
  },

  getPlayerView(state, playerID): PlayerView {
    const myIdx = state.players.findIndex((p) => p.id === playerID);
    const opponentIdx = 1 - myIdx;
    const remaining = shotsPerTurn(state.fastMode) - state.shotsThisTurn;

    if (myIdx === -1) {
      return {
        myGrid: new Array(TOTAL_CELLS).fill(0),
        myShots: new Array(TOTAL_CELLS).fill(0),
        opponentShots: new Array(TOTAL_CELLS).fill(0),
        myShipsSunk: new Array(state.fleet.length).fill(false),
        opponentShipsSunk: new Array(state.fleet.length).fill(false),
        phase: state.phase,
        currentPlayer: state.players[state.currentPlayerIdx].id,
        myPlaced: false,
        opponentPlaced: false,
        winner: state.winner,
        shotsRemaining: remaining,
        fastMode: state.fastMode,
      };
    }

    const me = state.players[myIdx];
    const opponent = state.players[opponentIdx];

    const myShipsSunk = state.fleet.map((_, i) => checkShipSunk(me.grid, opponent.shots, i + 1));
    const opponentShipsSunk = state.fleet.map((_, i) =>
      checkShipSunk(opponent.grid, me.shots, i + 1),
    );

    return {
      myGrid: me.grid,
      myShots: me.shots,
      opponentShots: opponent.shots,
      myShipsSunk,
      opponentShipsSunk,
      phase: state.phase,
      currentPlayer: state.players[state.currentPlayerIdx].id,
      myPlaced: me.placed,
      opponentPlaced: opponent.placed,
      winner: state.winner,
      shotsRemaining: remaining,
      fastMode: state.fastMode,
    };
  },

  getSpectatorView(state): PlayerView {
    const p0 = state.players[0];
    const p1 = state.players[1];
    return {
      myGrid: p0.grid,
      myShots: p0.shots,
      opponentShots: p1.shots,
      myShipsSunk: state.fleet.map((_, i) => checkShipSunk(p0.grid, p1.shots, i + 1)),
      opponentShipsSunk: state.fleet.map((_, i) => checkShipSunk(p1.grid, p0.shots, i + 1)),
      phase: state.phase,
      currentPlayer: state.players[state.currentPlayerIdx].id,
      myPlaced: p0.placed,
      opponentPlaced: p1.placed,
      winner: state.winner,
      shotsRemaining: shotsPerTurn(state.fastMode) - state.shotsThisTurn,
      fastMode: state.fastMode,
    };
  },
};
