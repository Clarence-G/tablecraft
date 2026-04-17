import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ActionResult, GameContext, GameLogic, GameMeta } from './types/engine';
import { buildActionSchema, buildGameDetail } from './plugin-meta';

function makeStubLogic<T extends z.ZodTypeAny>(actions: T): GameLogic<unknown, z.infer<T>, unknown> {
  return {
    actions,
    setup(): unknown {
      return {};
    },
    onAction(state: unknown): ActionResult<unknown> {
      return { ok: true, state };
    },
    getPlayerView(state: unknown): unknown {
      return state;
    },
  };
}

const STUB_META: GameMeta = {
  id: 'stub',
  name: 'Stub',
  description: '',
  minPlayers: 1,
  maxPlayers: 2,
};

describe('buildActionSchema', () => {
  it('converts a simple z.object to JSON Schema', () => {
    const actions = z.object({ type: z.literal('move'), dx: z.number(), dy: z.number() });
    const schema = buildActionSchema(makeStubLogic(actions)) as Record<string, unknown>;
    expect(schema).toMatchObject({ type: 'object' });
    expect(schema.properties).toBeDefined();
  });

  it('converts z.discriminatedUnion (the shape UNO / poker use)', () => {
    const actions = z.discriminatedUnion('type', [
      z.object({ type: z.literal('fold') }),
      z.object({ type: z.literal('call'), amount: z.number() }),
      z.object({ type: z.literal('raise'), to: z.number().int().min(0) }),
    ]);
    const schema = buildActionSchema(makeStubLogic(actions)) as Record<string, unknown>;
    const serialized = JSON.stringify(schema);
    // The literal type values must appear so an agent can enumerate them
    expect(serialized).toContain('fold');
    expect(serialized).toContain('call');
    expect(serialized).toContain('raise');
  });
});

describe('buildGameDetail', () => {
  it('includes rules, agentRules, and actionSchema in output', () => {
    const meta: GameMeta = {
      ...STUB_META,
      rules: 'human rules',
      agentRules: 'agent rules text',
    };
    const logic = makeStubLogic(z.object({ type: z.literal('tick') }));
    const detail = buildGameDetail(meta, logic);
    expect(detail.rules).toBe('human rules');
    expect(detail.agentRules).toBe('agent rules text');
    expect(detail.actionSchema).toBeDefined();
    expect(typeof detail.actionSchema).toBe('object');
  });

  it('returns null for missing optional fields rather than omitting them', () => {
    const logic = makeStubLogic(z.object({ type: z.literal('tick') }));
    const detail = buildGameDetail(STUB_META, logic);
    expect(detail.rules).toBeNull();
    expect(detail.agentRules).toBeNull();
    expect(detail.tags).toEqual([]);
  });

  it('exposes enough info for an agent: id, playerCounts, actionSchema', () => {
    const logic = makeStubLogic(z.object({ type: z.literal('tick') }));
    const detail = buildGameDetail(STUB_META, logic);
    expect(detail.id).toBe('stub');
    expect(detail.minPlayers).toBe(1);
    expect(detail.maxPlayers).toBe(2);
    expect(detail.actionSchema).not.toBeNull();
  });
});
