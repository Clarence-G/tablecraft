import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'connect-four',
  name: '四子棋',
  description: '6x7棋盘，先连成四子者胜',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '棋类'],
  icon: 'stack',
  estimatedMinutes: 10,
  scene: {
    surface: { color: '#4a3528', texture: 'wood', accent: '#d4a056' },
    ambience: { type: 'spotlight', warmth: 'warm', intensity: 0.32 },
  },
  rules:
    '两人轮流在 6x7 的竖直棋盘上投放棋子，棋子受重力下落至最低空位，先将四颗棋子连成一条线（横、竖、斜均可）的玩家获胜。',
  agentRules: `6-row x 7-column vertical board. Pieces drop to the lowest empty cell in the chosen column. Player 1 goes first.

Action: { "type": "drop", "col": <int 0-6> }

PlayerView fields:
  board: number[] — 42 cells (row-major, row 0 = top), 0=empty, 1=player1, 2=player2. Index = row*7+col.
  currentPlayer: string — playerID whose turn it is
  myPlayerIndex: 0|1 — your player index (0=first player, 1=second player)
  winner: string|null — playerID of winner, null if ongoing
  isDraw: boolean — true if board is full with no winner

Win condition: four consecutive pieces in a line (horizontal, vertical, diagonal).
Invalid moves: dropping into a full column (all 6 cells occupied), acting when not your turn.`,
};

export const ROWS = 6;
export const COLS = 7;

export const ActionSchema = z.object({
  type: z.literal('drop'),
  col: z
    .number()
    .int()
    .min(0)
    .max(COLS - 1),
});
export type Action = z.infer<typeof ActionSchema>;

export interface PlayerView {
  board: number[];
  currentPlayer: string;
  myPlayerIndex: number;
  winner: string | null;
  isDraw: boolean;
}
