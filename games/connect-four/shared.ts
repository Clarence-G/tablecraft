import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'connect-four',
  name: '四子棋',
  description: '6x7棋盘，先连成四子者胜',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '棋类'],
  icon: 'Circle',
  estimatedMinutes: 10,
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
