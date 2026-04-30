import { type ActionResult, type GameContext, type GameLogic, logAction, logSystem } from '@repo/shared';
import { type Action, ActionSchema, COLS, type PlayerView, ROWS } from './shared';

interface ConnectFourState {
  board: number[];
  currentPlayer: string;
  players: string[];
  winner: string | null;
  isDraw: boolean;
}

const EMPTY = 0;

function dropPiece(
  board: number[],
  col: number,
  playerValue: 1 | 2,
): { row: number; board: number[] } | null {
  if (col < 0 || col >= COLS) return null;
  const newBoard = [...board];
  for (let row = ROWS - 1; row >= 0; row--) {
    const index = row * COLS + col;
    if (newBoard[index] === EMPTY) {
      newBoard[index] = playerValue;
      return { row, board: newBoard };
    }
  }
  return null; // column full
}

function checkWin(board: number[], row: number, col: number): boolean {
  const playerValue = board[row * COLS + col];
  if (playerValue === EMPTY) return false;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r * COLS + c] !== playerValue) break;
      count++;
    }
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r * COLS + c] !== playerValue) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

function checkDraw(board: number[]): boolean {
  for (let col = 0; col < COLS; col++) {
    if (board[col] === EMPTY) return false;
  }
  return true;
}

export const logic: GameLogic<ConnectFourState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): ConnectFourState {
    return {
      board: Array(ROWS * COLS).fill(EMPTY),
      currentPlayer: ctx.players[0],
      players: ctx.players,
      winner: null,
      isDraw: false,
    };
  },

  onAction(state, action, playerID): ActionResult<ConnectFourState> {
    if (state.winner || state.isDraw) {
      return { ok: false, reason: 'Game already over' };
    }
    if (playerID !== state.currentPlayer) {
      return { ok: false, reason: 'Not your turn' };
    }

    const playerIndex = state.players.indexOf(playerID);
    const playerValue = (playerIndex + 1) as 1 | 2;
    const result = dropPiece(state.board, action.col, playerValue);

    if (!result) {
      return { ok: false, reason: 'Column is full' };
    }

    const { row, board: newBoard } = result;
    const won = checkWin(newBoard, row, action.col);
    const draw = !won && checkDraw(newBoard);
    const nextPlayer =
      won || draw ? state.currentPlayer : state.players.find((p) => p !== playerID)!;

    const newState: ConnectFourState = {
      ...state,
      board: newBoard,
      currentPlayer: nextPlayer,
      winner: won ? playerID : null,
      isDraw: draw,
    };

    const dropLog = logAction(playerID, 'log.drop', { col: action.col + 1, row: row + 1 });

    if (won) {
      const loser = state.players.find((p) => p !== playerID)!;
      return {
        ok: true,
        state: newState,
        events: [
          dropLog,
          logSystem('log.win', { actorId: playerID }),
          { type: 'END_GAME', rankings: [playerID, loser] },
        ],
      };
    }

    if (draw) {
      return {
        ok: true,
        state: newState,
        events: [dropLog, logSystem('log.draw'), { type: 'END_GAME', rankings: state.players }],
      };
    }

    return { ok: true, state: newState, events: [dropLog] };
  },

  getPlayerView(state, playerID): PlayerView {
    const myPlayerIndex = state.players.indexOf(playerID);
    return {
      board: state.board,
      currentPlayer: state.currentPlayer,
      myPlayerIndex,
      winner: state.winner,
      isDraw: state.isDraw,
    };
  },

  getSpectatorView(state): PlayerView {
    return {
      board: state.board,
      currentPlayer: state.currentPlayer,
      myPlayerIndex: 0,
      winner: state.winner,
      isDraw: state.isDraw,
    };
  },
};
