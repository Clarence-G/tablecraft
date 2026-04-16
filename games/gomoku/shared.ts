import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'gomoku',
  name: '五子棋',
  description: '经典五子棋，先连成五子者胜',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '棋类'],
  icon: 'Target',
  estimatedMinutes: 10,
  rules: '两人轮流在 15x15 棋盘上落子（黑先白后），先将五颗棋子连成一条线（横、竖、斜均可）的玩家获胜。落子后不可移动或移除。',
  agentRules: `15x15 board, coordinates row=0-14 col=0-14, black plays first.
Turn-based: currentPlayer in PlayerView indicates who acts next.

Action: { "type": "place", "row": <int 0-14>, "col": <int 0-14> }

PlayerView fields:
  board: ("black"|"white"|null)[][] — 15x15 grid
  currentPlayer: string — playerID whose turn it is
  myStone: "black"|"white" — your color
  winner: string|null — playerID of winner, null if ongoing

Win condition: five consecutive stones in a line (horizontal, vertical, diagonal).
Invalid moves: placing on an occupied cell, acting when not your turn.`,
};

export const BOARD_SIZE = 15;

export const ActionSchema = z.object({
  type: z.literal('place'),
  row: z
    .number()
    .int()
    .min(0)
    .max(BOARD_SIZE - 1),
  col: z
    .number()
    .int()
    .min(0)
    .max(BOARD_SIZE - 1),
});
export type Action = z.infer<typeof ActionSchema>;

export type Stone = 'black' | 'white';

export interface PlayerView {
  board: (Stone | null)[][];
  currentPlayer: string;
  myStone: Stone;
  winner: string | null;
}
