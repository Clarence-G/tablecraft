import { type ActionResult, type GameContext, type GameLogic, logAction, logSystem } from '@repo/shared';
import { type Action, ActionSchema, BOARD_SIZE, type PlayerView, type Stone } from './shared';

interface GomokuState {
  board: (Stone | null)[][];
  currentPlayer: string; // playerID
  players: string[]; // [black, white]
  winner: string | null;
}

function emptyBoard(): (Stone | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function stoneOf(players: string[], playerID: string): Stone {
  return players[0] === playerID ? 'black' : 'white';
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function countLine(
  board: (Stone | null)[][],
  row: number,
  col: number,
  dr: number,
  dc: number,
  stone: Stone,
): number {
  let count = 0;
  for (let i = 1; i < 5; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
    if (board[r][c] !== stone) break;
    count++;
  }
  return count;
}

function checkWin(board: (Stone | null)[][], row: number, col: number, stone: Stone): boolean {
  for (const [dr, dc] of DIRECTIONS) {
    const fwd = countLine(board, row, col, dr, dc, stone);
    const bwd = countLine(board, row, col, -dr, -dc, stone);
    if (fwd + bwd + 1 >= 5) return true;
  }
  return false;
}

export const logic: GameLogic<GomokuState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): GomokuState {
    return {
      board: emptyBoard(),
      currentPlayer: ctx.players[0],
      players: ctx.players,
      winner: null,
    };
  },

  onAction(state, action, playerID): ActionResult<GomokuState> {
    if (state.winner) {
      return { ok: false, reason: 'Game already over' };
    }
    if (playerID !== state.currentPlayer) {
      return { ok: false, reason: 'Not your turn' };
    }

    const { row, col } = action;
    if (state.board[row][col] !== null) {
      return { ok: false, reason: 'Cell already occupied' };
    }

    const stone = stoneOf(state.players, playerID);
    const newBoard = state.board.map((r, ri) =>
      r.map((cell, ci) => (ri === row && ci === col ? stone : cell)),
    );

    const won = checkWin(newBoard, row, col, stone);
    const nextPlayer = won ? state.currentPlayer : state.players.find((p) => p !== playerID)!;

    const newState: GomokuState = {
      ...state,
      board: newBoard,
      currentPlayer: nextPlayer,
      winner: won ? playerID : null,
    };

    const moveLog = logAction(
      playerID,
      stone === 'black' ? 'log.moveBlack' : 'log.moveWhite',
      { row: row + 1, col: col + 1 },
    );

    if (won) {
      const loser = state.players.find((p) => p !== playerID)!;
      return {
        ok: true,
        state: newState,
        events: [
          moveLog,
          logSystem('log.win', { actorId: playerID }),
          { type: 'END_GAME', rankings: [playerID, loser] },
        ],
      };
    }

    return { ok: true, state: newState, events: [moveLog] };
  },

  getPlayerView(state, playerID): PlayerView {
    return {
      board: state.board,
      currentPlayer: state.currentPlayer,
      myStone: stoneOf(state.players, playerID),
      winner: state.winner,
    };
  },

  getSpectatorView(state): PlayerView {
    return {
      board: state.board,
      currentPlayer: state.currentPlayer,
      myStone: 'black',
      winner: state.winner,
    };
  },
};
