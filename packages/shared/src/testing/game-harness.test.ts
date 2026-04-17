import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ActionResult, GameContext, GameLogic } from '../types/engine';
import { GameTestHarness } from './game-harness';

// A minimal toy game: two players have secret numbers, can increment each turn.
// We use this to exercise harness contract assertions under both "correct" and
// "buggy" logic implementations.

interface ToyState {
  secrets: Record<string, number>;
  turn: string;
  turnCount: number;
}
const ToyAction = z.object({ type: z.literal('tick') });
type ToyAction = z.infer<typeof ToyAction>;
interface ToyView {
  mySecret: number;
  otherSecrets: Record<string, number | null>;
  turn: string;
  turnCount: number;
}

function makeCorrectLogic(): GameLogic<ToyState, ToyAction, ToyView> {
  return {
    actions: ToyAction,
    setup(ctx: GameContext): ToyState {
      return {
        secrets: Object.fromEntries(ctx.players.map((id, i) => [id, 100 + i])),
        turn: ctx.players[0]!,
        turnCount: 0,
      };
    },
    onAction(state, _action, playerID, ctx): ActionResult<ToyState> {
      if (state.turn !== playerID) return { ok: false, reason: 'not your turn' };
      const nextIdx = (ctx.players.indexOf(playerID) + 1) % ctx.players.length;
      return {
        ok: true,
        state: {
          ...state,
          secrets: { ...state.secrets, [playerID]: (state.secrets[playerID] ?? 0) + 1 },
          turn: ctx.players[nextIdx]!,
          turnCount: state.turnCount + 1,
        },
      };
    },
    getPlayerView(state, playerID): ToyView {
      const otherSecrets: Record<string, number | null> = {};
      for (const id of Object.keys(state.secrets)) {
        otherSecrets[id] = id === playerID ? null : null;
      }
      return {
        mySecret: state.secrets[playerID] ?? 0,
        otherSecrets,
        turn: state.turn,
        turnCount: state.turnCount,
      };
    },
    onPlayerDisconnect(state, playerID): ActionResult<ToyState> {
      return {
        ok: true,
        state: { ...state, secrets: { ...state.secrets, [playerID]: -1 } },
      };
    },
  };
}

describe('GameTestHarness contract guards', () => {
  describe('input immutability', () => {
    it('throws if logic mutates input state directly', () => {
      const badLogic: GameLogic<ToyState, ToyAction, ToyView> = {
        ...makeCorrectLogic(),
        onAction(state, _action, playerID): ActionResult<ToyState> {
          // Classic bug: mutate in place, return same reference
          state.secrets[playerID] = (state.secrets[playerID] ?? 0) + 1;
          return { ok: true, state };
        },
      };
      const h = new GameTestHarness(badLogic, { players: ['A', 'B'] });
      h.setup();
      expect(() => h.action('A', { type: 'tick' })).toThrow(TypeError);
    });

    it('throws if logic mutates a nested array', () => {
      interface ArrState {
        board: number[];
        turn: string;
      }
      const arrAction = z.object({ type: z.literal('push') });
      const badArrLogic: GameLogic<ArrState, z.infer<typeof arrAction>, ArrState> = {
        actions: arrAction,
        setup(ctx: GameContext): ArrState {
          return { board: [0, 0], turn: ctx.players[0]! };
        },
        onAction(state, _action): ActionResult<ArrState> {
          state.board.push(1); // nested mutation
          return { ok: true, state };
        },
        getPlayerView(state) {
          return state;
        },
      };
      const h = new GameTestHarness(badArrLogic, { players: ['A', 'B'] });
      h.setup();
      expect(() => h.action('A', { type: 'push' })).toThrow(TypeError);
    });

    it('correct immutable logic runs fine', () => {
      const h = new GameTestHarness(makeCorrectLogic(), { players: ['A', 'B'] });
      h.setup();
      const result = h.action('A', { type: 'tick' });
      expect(result.ok).toBe(true);
      expect(h.rawState.turnCount).toBe(1);
    });

    it('allows fixture mutation on rawState after an action', () => {
      const h = new GameTestHarness(makeCorrectLogic(), { players: ['A', 'B'] });
      h.setup();
      h.action('A', { type: 'tick' });
      // Test helper patches state directly — must not be frozen
      expect(() => {
        (h.rawState as ToyState).secrets.A = 999;
      }).not.toThrow();
      expect(h.rawState.secrets.A).toBe(999);
    });

    it('can be disabled via freezeInput: false', () => {
      const mutatingLogic: GameLogic<ToyState, ToyAction, ToyView> = {
        ...makeCorrectLogic(),
        onAction(state, _action, playerID): ActionResult<ToyState> {
          state.secrets[playerID] = (state.secrets[playerID] ?? 0) + 1;
          return { ok: true, state };
        },
      };
      const h = new GameTestHarness(mutatingLogic, {
        players: ['A', 'B'],
        freezeInput: false,
      });
      h.setup();
      expect(() => h.action('A', { type: 'tick' })).not.toThrow();
    });
  });

  describe('expectViewsDiffer', () => {
    it('passes when the field differs between players', () => {
      const h = new GameTestHarness(makeCorrectLogic(), { players: ['A', 'B'] });
      h.setup();
      // mySecret is 100 for A, 101 for B — differs
      expect(() => h.expectViewsDiffer('mySecret', 'A', 'B')).not.toThrow();
    });

    it('throws when hidden info leaks to another player', () => {
      const leakyLogic: GameLogic<ToyState, ToyAction, ToyView> = {
        ...makeCorrectLogic(),
        getPlayerView(state): ToyView {
          // Bug: every viewer sees every secret
          return {
            mySecret: Math.max(...Object.values(state.secrets)),
            otherSecrets: state.secrets,
            turn: state.turn,
            turnCount: state.turnCount,
          };
        },
      };
      const h = new GameTestHarness(leakyLogic, { players: ['A', 'B'] });
      h.setup();
      expect(() => h.expectViewsDiffer('otherSecrets', 'A', 'B')).toThrow(/Hidden info leak/);
    });

    it('throws when public field is asserted as hidden (misuse guard)', () => {
      const h = new GameTestHarness(makeCorrectLogic(), { players: ['A', 'B'] });
      h.setup();
      // `turn` is public — identical for both viewers. Asserting it differs must fail.
      expect(() => h.expectViewsDiffer('turn', 'A', 'B')).toThrow(/Hidden info leak/);
    });
  });

  describe('disconnect', () => {
    it('calls logic.onPlayerDisconnect and updates state', () => {
      const h = new GameTestHarness(makeCorrectLogic(), { players: ['A', 'B'] });
      h.setup();
      const result = h.disconnect('A');
      expect(result.ok).toBe(true);
      expect(h.rawState.secrets.A).toBe(-1);
    });

    it('throws if game does not implement onPlayerDisconnect', () => {
      const { onPlayerDisconnect: _ignored, ...rest } = makeCorrectLogic();
      const h = new GameTestHarness(rest, { players: ['A', 'B'] });
      h.setup();
      expect(() => h.disconnect('A')).toThrow(/does not implement onPlayerDisconnect/);
    });

    it('protects input state from mutation inside onPlayerDisconnect too', () => {
      const badLogic: GameLogic<ToyState, ToyAction, ToyView> = {
        ...makeCorrectLogic(),
        onPlayerDisconnect(state, playerID): ActionResult<ToyState> {
          state.secrets[playerID] = -1; // mutation
          return { ok: true, state };
        },
      };
      const h = new GameTestHarness(badLogic, { players: ['A', 'B'] });
      h.setup();
      expect(() => h.disconnect('A')).toThrow(TypeError);
    });
  });
});
