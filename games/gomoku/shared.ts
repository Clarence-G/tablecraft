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
