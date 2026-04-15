import type { ActionResult, GameContext, GameLogic } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  CLASSIC_SHIPS,
  GRID_SIZE,
  type Phase,
  type PlayerView,
  TOTAL_CELLS,
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

export const logic: GameLogic<BattleshipState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): BattleshipState {
    return {
      players: [emptyPlayerState(ctx.players[0]), emptyPlayerState(ctx.players[1])],
      phase: 'placement',
      currentPlayerIdx: 0,
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

      if (!validateShipPlacements(action.placements)) {
        return { ok: false, reason: '舰船部署无效' };
      }

      const grid = placeShipsOnGrid(action.placements);
      if (!grid) return { ok: false, reason: '舰船部署无效' };

      const updatedPlayer: PlayerBattleState = { ...player, grid, placed: true };
      const newPlayers: [PlayerBattleState, PlayerBattleState] =
        playerIdx === 0 ? [updatedPlayer, state.players[1]] : [state.players[0], updatedPlayer];

      const bothPlaced = newPlayers[0].placed && newPlayers[1].placed;
      const newPhase: Phase = bothPlaced ? 'playing' : 'placement';

      return {
        ok: true,
        state: { ...state, players: newPlayers, phase: newPhase },
        events: [],
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

      if (checkAllShipsSunk(defender.grid, newShots)) {
        const loser = defender.id;
        return {
          ok: true,
          state: {
            ...state,
            players: newPlayers,
            phase: 'finished',
            winner: playerID,
            currentPlayerIdx: attackerIdx,
          },
          events: [{ type: 'END_GAME', rankings: [playerID, loser] }],
        };
      }

      return {
        ok: true,
        state: {
          ...state,
          players: newPlayers,
          currentPlayerIdx: defenderIdx,
        },
        events: [],
      };
    }

    return { ok: false, reason: '未知操作' };
  },

  getPlayerView(state, playerID): PlayerView {
    const myIdx = state.players.findIndex((p) => p.id === playerID);
    const opponentIdx = 1 - myIdx;

    if (myIdx === -1) {
      return {
        myGrid: new Array(TOTAL_CELLS).fill(0),
        myShots: new Array(TOTAL_CELLS).fill(0),
        opponentShots: new Array(TOTAL_CELLS).fill(0),
        myShipsSunk: new Array(CLASSIC_SHIPS.length).fill(false),
        opponentShipsSunk: new Array(CLASSIC_SHIPS.length).fill(false),
        phase: state.phase,
        currentPlayer: state.players[state.currentPlayerIdx].id,
        myPlaced: false,
        opponentPlaced: false,
        winner: state.winner,
      };
    }

    const me = state.players[myIdx];
    const opponent = state.players[opponentIdx];

    const myShipsSunk = CLASSIC_SHIPS.map((_, i) => checkShipSunk(me.grid, opponent.shots, i + 1));
    const opponentShipsSunk = CLASSIC_SHIPS.map((_, i) =>
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
    };
  },

  getSpectatorView(state): PlayerView {
    const p0 = state.players[0];
    const p1 = state.players[1];
    return {
      myGrid: p0.grid,
      myShots: p0.shots,
      opponentShots: p1.shots,
      myShipsSunk: CLASSIC_SHIPS.map((_, i) => checkShipSunk(p0.grid, p1.shots, i + 1)),
      opponentShipsSunk: CLASSIC_SHIPS.map((_, i) => checkShipSunk(p1.grid, p0.shots, i + 1)),
      phase: state.phase,
      currentPlayer: state.players[state.currentPlayerIdx].id,
      myPlaced: p0.placed,
      opponentPlaced: p1.placed,
      winner: state.winner,
    };
  },
};
