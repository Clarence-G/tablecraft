import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'template',
  name: '游戏模板',
  description: '用于 AI 生成新游戏的模板',
  minPlayers: 2,
  maxPlayers: 4,
  tags: [],
};

// ---- Action Schema ----
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('example_action') }),
]);
export type Action = z.infer<typeof ActionSchema>;

// ---- View (what each player sees) ----
export interface PlayerView {
  currentPlayer: string;
  // TODO: add game-specific view fields
}
