import { zodToJsonSchema } from 'zod-to-json-schema';
import type { GameLogic, GameMeta } from './types/engine';

/**
 * Convert a game's Zod action schema to a JSON Schema document agents can
 * consume to generate valid actions. Kept standalone so the CLI and other
 * tooling can also call it.
 */
export function buildActionSchema(logic: GameLogic): unknown {
  return zodToJsonSchema(logic.actions, { target: 'jsonSchema7' });
}

/**
 * Shape of the `/api/games/:gameId` response payload. Callers can rely on
 * these fields; extra fields may be added over time.
 */
export interface GameDetailResponse {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  tags: string[];
  /** Human-readable rules (shown in UI). */
  rules: string | null;
  /** Natural-language strategy/view hints for agents. */
  agentRules: string | null;
  /** JSON Schema for the action payload, auto-generated from the Zod schema. */
  actionSchema: unknown;
}

export function buildGameDetail(meta: GameMeta, logic: GameLogic): GameDetailResponse {
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    minPlayers: meta.minPlayers,
    maxPlayers: meta.maxPlayers,
    tags: meta.tags ?? [],
    rules: meta.rules ?? null,
    agentRules: meta.agentRules ?? null,
    actionSchema: buildActionSchema(logic),
  };
}
