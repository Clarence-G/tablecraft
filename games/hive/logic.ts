import type { ActionResult, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  type HiveColor,
  type PieceInventory,
  type PlayerView,
  type Tile,
  type ValidActions,
  checkWin,
  computeInventory,
  coordEqual,
  coordKey,
  getAllValidActions,
  getPlayerTurnCount,
  hasAnyValidAction,
} from './shared';

interface HiveState {
  tiles: Tile[];
  players: [string, string]; // [white, black]
  currentPlayerIdx: number; // 0 = white, 1 = black
  phase: 'playing' | 'finished';
  winner: string | null;
  isDraw: boolean;
  turnNumber: number; // starts at 1
}

function colorOf(players: [string, string], playerID: string): HiveColor {
  return players[0] === playerID ? 'white' : 'black';
}

function getInventory(state: HiveState, color: HiveColor): PieceInventory {
  return computeInventory(state.tiles, color);
}

function getValidActionsForPlayer(state: HiveState, playerID: string): ValidActions {
  const color = colorOf(state.players, playerID);
  const isFirstPlayer = state.players[0] === playerID;
  const playerTurnCount = getPlayerTurnCount(state.turnNumber, isFirstPlayer);
  const inventory = getInventory(state, color);
  return getAllValidActions(state.tiles, color, playerTurnCount, inventory);
}

export const logic: GameLogic<HiveState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): HiveState {
    return {
      tiles: [],
      players: [ctx.players[0], ctx.players[1]] as [string, string],
      currentPlayerIdx: 0,
      phase: 'playing',
      winner: null,
      isDraw: false,
      turnNumber: 1,
    };
  },

  onAction(state, action, playerID): ActionResult<HiveState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: 'Game already over' };
    }

    const currentPlayer = state.players[state.currentPlayerIdx];
    if (playerID !== currentPlayer) {
      return { ok: false, reason: 'Not your turn' };
    }

    const color = colorOf(state.players, playerID);
    let newTiles = [...state.tiles];
    let actionLog: Extract<ReturnType<typeof logAction>, { type: 'NOTIFY_ALL' }>;

    if (action.type === 'place') {
      // Validate placement
      const validActions = getValidActionsForPlayer(state, playerID);
      const placementGroup = validActions.placements.find((p) => p.pieceType === action.pieceType);
      if (!placementGroup) {
        return { ok: false, reason: 'No valid placements for this piece type' };
      }
      const targetValid = placementGroup.targets.some(
        (t) => t.q === action.coord.q && t.r === action.coord.r,
      );
      if (!targetValid) {
        return { ok: false, reason: 'Invalid placement target' };
      }

      // Compute stack level (should be 0 for placement, but handle edge case)
      const stackLevel = 0;
      newTiles = [
        ...state.tiles,
        {
          coord: action.coord,
          color,
          type: action.pieceType,
          stackLevel,
        },
      ];
      actionLog = logAction(playerID, 'log.place', {
        pieceType: action.pieceType,
        q: action.coord.q,
        r: action.coord.r,
      });
    } else if (action.type === 'move') {
      // Validate move
      const validActions = getValidActionsForPlayer(state, playerID);
      const moveGroup = validActions.moves.find(
        (m) => m.from.q === action.from.q && m.from.r === action.from.r,
      );
      if (!moveGroup) {
        return { ok: false, reason: 'No valid moves from this position' };
      }
      const targetValid = moveGroup.targets.some((t) => t.q === action.to.q && t.r === action.to.r);
      if (!targetValid) {
        return { ok: false, reason: 'Invalid move target' };
      }

      // Find the top tile at `from`
      const fromKey = coordKey(action.from);
      const stack = state.tiles
        .filter((t) => coordKey(t.coord) === fromKey)
        .sort((a, b) => a.stackLevel - b.stackLevel);
      const movingTile = stack[stack.length - 1];
      if (!movingTile) {
        return { ok: false, reason: 'No tile at from position' };
      }

      // Remove the moving tile from its current position
      newTiles = state.tiles.filter(
        (t) => !(coordEqual(t.coord, action.from) && t.stackLevel === movingTile.stackLevel),
      );

      // Compute target stack level (0 unless beetle climbing)
      const targetKey = coordKey(action.to);
      const targetStack = newTiles.filter((t) => coordKey(t.coord) === targetKey);
      const newStackLevel = targetStack.length > 0 ? targetStack.length : 0;

      newTiles = [...newTiles, { ...movingTile, coord: action.to, stackLevel: newStackLevel }];
      actionLog = logAction(playerID, 'log.move', {
        pieceType: movingTile.type,
        q: action.to.q,
        r: action.to.r,
      });
    } else {
      // pass — only valid if player has no valid actions
      const validActions = getValidActionsForPlayer(state, playerID);
      if (hasAnyValidAction(validActions)) {
        return { ok: false, reason: 'Cannot pass when you have valid actions' };
      }
      actionLog = logAction(playerID, 'log.pass');
    }

    // Check win condition
    const winResult = checkWin(newTiles);
    const isFinished = winResult.type !== 'none';
    let winner: string | null = null;
    let isDraw = false;

    if (winResult.type === 'white') {
      winner = state.players[0];
    } else if (winResult.type === 'black') {
      winner = state.players[1];
    } else if (winResult.type === 'draw') {
      isDraw = true;
    }

    const nextPlayerIdx = state.currentPlayerIdx === 0 ? 1 : 0;
    const newTurnNumber = state.turnNumber + 1;

    const newState: HiveState = {
      ...state,
      tiles: newTiles,
      currentPlayerIdx: isFinished ? state.currentPlayerIdx : nextPlayerIdx,
      phase: isFinished ? 'finished' : 'playing',
      winner,
      isDraw,
      turnNumber: isFinished ? state.turnNumber : newTurnNumber,
    };

    if (isFinished) {
      if (isDraw) {
        return {
          ok: true,
          state: newState,
          events: [
            actionLog,
            logSystem('log.gameDraw', {}),
            { type: 'END_GAME', rankings: [state.players[0], state.players[1]] },
          ],
        };
      }
      const loser = state.players.find((p) => p !== winner);
      return {
        ok: true,
        state: newState,
        events: [
          actionLog,
          logSystem('log.win', { actorId: winner as string }),
          { type: 'END_GAME', rankings: [winner as string, loser as string] },
        ],
      };
    }

    return { ok: true, state: newState, events: [actionLog] };
  },

  getPlayerView(state, playerID): PlayerView {
    const color = colorOf(state.players, playerID);
    const isCurrentPlayer = state.players[state.currentPlayerIdx] === playerID;

    let validActions: ValidActions | null = null;
    if (isCurrentPlayer && state.phase === 'playing') {
      validActions = getValidActionsForPlayer(state, playerID);
    }

    return {
      tiles: state.tiles,
      myColor: color,
      currentPlayer: state.players[state.currentPlayerIdx],
      phase: state.phase,
      validActions,
      whiteInventory: computeInventory(state.tiles, 'white'),
      blackInventory: computeInventory(state.tiles, 'black'),
      winner: state.winner,
      isDraw: state.isDraw,
      turnNumber: state.turnNumber,
    };
  },

  getSpectatorView(state): PlayerView {
    return {
      tiles: state.tiles,
      myColor: 'white',
      currentPlayer: state.players[state.currentPlayerIdx],
      phase: state.phase,
      validActions: null,
      whiteInventory: computeInventory(state.tiles, 'white'),
      blackInventory: computeInventory(state.tiles, 'black'),
      winner: state.winner,
      isDraw: state.isDraw,
      turnNumber: state.turnNumber,
    };
  },
};
