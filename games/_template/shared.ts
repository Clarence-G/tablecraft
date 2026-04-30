import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'template',
  name: '游戏模板',
  description: '用于 AI 生成新游戏的模板',
  minPlayers: 2,
  maxPlayers: 4,
  tags: [],
  // icon: Lucide icon name (e.g. 'Crown') OR SVG filename (no extension)
  // in packages/client/public/game-icons/. Renderer tries SVG first, then
  // falls back to the Lucide component with the same name, then to a default.
  // icon: 'Gamepad2',

  // estimatedMinutes: 15,

  // Human-readable rules shown in the room's Rules modal. i18n is applied if a
  // `rules` key exists in games/<id>/i18n/<lang>.json (overrides this string).
  // rules: '',

  // Machine-readable hints for AI agents via REST /api/games/<id>. Cover action
  // format, view schema caveats, strategic tips. JSON Schema is auto-derived
  // from ActionSchema, so focus on things the schema can't express.
  // agentRules: '',

  // Play Surface theme (Zone C). Omit for the default cream platform look.
  // Textures: 'wood' | 'felt' | 'velvet' | 'leather' | 'paper' | null.
  // See docs/LAYOUT.md §5 for the full schema and texture → game mapping.
  // scene: {
  //   surface: { color: '#1f5233', texture: 'felt', accent: '#d4a056' },
  //   ambience: { type: 'spotlight', warmth: 'warm', intensity: 0.6 },
  // },
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
