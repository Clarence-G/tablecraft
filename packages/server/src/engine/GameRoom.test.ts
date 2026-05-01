import type { ActionResult, GameContext, GameLogic, GameMeta } from '@repo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GameRoom } from './GameRoom';

const ActionSchema = z.object({ type: z.literal('tick') });
type Action = z.infer<typeof ActionSchema>;

interface State {
  turn: string;
  lastDisconnected: string | null;
  ticks: number;
}

function makeLogic(
  overrides: Partial<GameLogic<State, Action, State>> = {},
): GameLogic<State, Action, State> {
  return {
    actions: ActionSchema,
    setup(ctx: GameContext): State {
      return { turn: ctx.players[0]!, lastDisconnected: null, ticks: 0 };
    },
    onAction(state, _action, playerID, ctx): ActionResult<State> {
      if (state.turn !== playerID) return { ok: false, reason: 'not your turn' };
      const next = ctx.players[(ctx.players.indexOf(playerID) + 1) % ctx.players.length]!;
      return { ok: true, state: { ...state, turn: next, ticks: state.ticks + 1 } };
    },
    getPlayerView(state): State {
      return state;
    },
    ...overrides,
  };
}

function makeMeta(overrides: Partial<GameMeta> = {}): GameMeta {
  return {
    id: 'test',
    name: 'Test Game',
    description: '',
    minPlayers: 2,
    maxPlayers: 2,
    ...overrides,
  };
}

function seatTwoPlayers(room: GameRoom) {
  room.join('A', 'Alice');
  room.join('B', 'Bob');
  room.ready('A');
  room.ready('B');
  room.start();
}

describe('GameRoom: actionThrottleMs from meta', () => {
  it('uses default 100ms when meta does not set throttle', () => {
    // two-turn logic so same player can act twice in quick succession
    const logic = makeLogic({
      onAction(state, _action, playerID): ActionResult<State> {
        return { ok: true, state: { ...state, turn: playerID, ticks: state.ticks + 1 } };
      },
    });
    const room = new GameRoom('test', makeMeta(), undefined, logic);
    seatTwoPlayers(room);

    room.handleAction('A', { type: 'tick' }, 1);
    expect(room.state).toMatchObject({ ticks: 1 });

    // Immediate second action from same player gets throttled
    const rejects: string[] = [];
    room.emitToPlayer = (_pid, event, data) => {
      if (event === 'game:reject') rejects.push(String(data));
    };
    room.handleAction('A', { type: 'tick' }, 2);
    expect(rejects).toContain('Too fast');
  });

  it('honors meta.actionThrottleMs override', () => {
    const logic = makeLogic({
      onAction(state, _action, playerID): ActionResult<State> {
        return { ok: true, state: { ...state, turn: playerID, ticks: state.ticks + 1 } };
      },
    });
    const room = new GameRoom('test', makeMeta({ actionThrottleMs: 0 }), undefined, logic);
    seatTwoPlayers(room);

    room.handleAction('A', { type: 'tick' }, 1);
    const rejects: string[] = [];
    room.emitToPlayer = (_pid, event, data) => {
      if (event === 'game:reject') rejects.push(String(data));
    };
    // With throttle=0, back-to-back actions from same player are allowed
    room.handleAction('A', { type: 'tick' }, 2);
    expect(rejects).not.toContain('Too fast');
    expect(room.state).toMatchObject({ ticks: 2 });
  });
});

describe('GameRoom: onPlayerDisconnect wiring', () => {
  it('does not call logic.onPlayerDisconnect if game is still waiting', () => {
    const spy = vi.fn<
      Parameters<NonNullable<GameLogic<State, Action, State>['onPlayerDisconnect']>>,
      ActionResult<State>
    >((state) => ({ ok: true, state }));
    const room = new GameRoom(
      'test',
      makeMeta(),
      undefined,
      makeLogic({ onPlayerDisconnect: spy }),
    );
    room.join('A', 'Alice');
    room.markDisconnected('A');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls logic.onPlayerDisconnect when disconnecting mid-game', () => {
    const spy = vi.fn<
      Parameters<NonNullable<GameLogic<State, Action, State>['onPlayerDisconnect']>>,
      ActionResult<State>
    >((state, playerID) => ({
      ok: true,
      state: { ...state, lastDisconnected: playerID },
    }));
    const room = new GameRoom(
      'test',
      makeMeta(),
      undefined,
      makeLogic({ onPlayerDisconnect: spy }),
    );
    seatTwoPlayers(room);

    room.markDisconnected('A');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe('A');
    expect(room.state).toMatchObject({ lastDisconnected: 'A' });
  });

  it('skips silently if game does not implement onPlayerDisconnect', () => {
    const room = new GameRoom('test', makeMeta(), undefined, makeLogic());
    seatTwoPlayers(room);
    const before = room.state;
    expect(() => room.markDisconnected('A')).not.toThrow();
    expect(room.state).toBe(before);
  });

  it('catches errors thrown by onPlayerDisconnect without killing the room', () => {
    const spy = vi.fn(() => {
      throw new Error('boom');
    });
    const room = new GameRoom(
      'test',
      makeMeta(),
      undefined,
      makeLogic({ onPlayerDisconnect: spy as never }),
    );
    seatTwoPlayers(room);
    const before = room.state;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => room.markDisconnected('A')).not.toThrow();
    expect(room.state).toBe(before);
    errSpy.mockRestore();
  });

  it('ignores ok:false result (disconnect must not apply rejected state)', () => {
    const spy = vi.fn(() => ({ ok: false, reason: 'nope' }) as const);
    const room = new GameRoom(
      'test',
      makeMeta(),
      undefined,
      makeLogic({ onPlayerDisconnect: spy }),
    );
    seatTwoPlayers(room);
    const before = room.state;
    room.markDisconnected('A');
    expect(room.state).toBe(before);
  });
});

describe('GameRoom: markDisconnected still updates player.connected flag', () => {
  it('sets connected=false regardless of logic callback', () => {
    const room = new GameRoom('test', makeMeta(), undefined, makeLogic());
    room.join('A', 'Alice');
    room.markDisconnected('A');
    expect(room.players.get('A')?.connected).toBe(false);
  });
});

describe('GameRoom: join capacity enforcement', () => {
  it('rejects a third player joining a full 2-player room', () => {
    const room = new GameRoom('test', makeMeta({ maxPlayers: 2 }), undefined, makeLogic());
    expect(room.join('A', 'Alice')).toEqual({ ok: true, data: undefined });
    expect(room.join('B', 'Bob')).toEqual({ ok: true, data: undefined });
    const third = room.join('C', 'Charlie');
    expect(third).toEqual({ ok: false, error: 'Room is full' });
    expect(room.players.size).toBe(2);
    expect(room.players.has('C')).toBe(false);
  });

  it('allows existing member to rejoin a full room (idempotent)', () => {
    const room = new GameRoom('test', makeMeta({ maxPlayers: 2 }), undefined, makeLogic());
    room.join('A', 'Alice');
    room.join('B', 'Bob');
    // Alice refreshing/reconnecting must still succeed even though size == max.
    const rejoin = room.join('A', 'Alice');
    expect(rejoin).toEqual({ ok: true, data: undefined });
    expect(room.players.size).toBe(2);
  });

  it('rejects with "Game already started" before capacity check when game is in progress', () => {
    const room = new GameRoom('test', makeMeta({ maxPlayers: 2 }), undefined, makeLogic());
    seatTwoPlayers(room);
    // Game now 'playing'. A non-member trying to join must hit the
    // already-started branch, not the full-room branch.
    const res = room.join('C', 'Charlie');
    expect(res).toEqual({ ok: false, error: 'Game already started' });
  });
});

describe('GameRoom: submitAction (REST) shares pipeline with handleAction', () => {
  function setupRoom() {
    const logic = makeLogic({
      onAction(state, _action, playerID): ActionResult<State> {
        return { ok: true, state: { ...state, turn: playerID, ticks: state.ticks + 1 } };
      },
    });
    const room = new GameRoom('test', makeMeta({ actionThrottleMs: 0 }), undefined, logic);
    seatTwoPlayers(room);
    return room;
  }

  it('returns ok with assigned seq on success', () => {
    const room = setupRoom();
    const res = room.submitAction('A', { type: 'tick' });
    expect(res).toEqual({ ok: true, seq: 0 });
    expect(room.state).toMatchObject({ ticks: 1 });
  });

  it('returns GAME_NOT_STARTED when room is in waiting status', () => {
    const room = new GameRoom('test', makeMeta(), undefined, makeLogic());
    room.join('A', 'Alice');
    const res = room.submitAction('A', { type: 'tick' });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: 'GAME_NOT_STARTED' });
  });

  it('returns INVALID_ACTION when Zod parse fails', () => {
    const room = setupRoom();
    const res = room.submitAction('A', { type: 'nope' });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: 'INVALID_ACTION' });
  });

  it('returns ACTION_REJECTED when logic rejects', () => {
    const logic = makeLogic({
      onAction(): ActionResult<State> {
        return { ok: false, reason: 'no good' };
      },
    });
    const room = new GameRoom('test', makeMeta({ actionThrottleMs: 0 }), undefined, logic);
    seatTwoPlayers(room);
    const res = room.submitAction('A', { type: 'tick' });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: 'ACTION_REJECTED', reason: 'no good' });
  });

  it('is idempotent on duplicate seq (stale-seq → ok)', () => {
    const room = setupRoom();
    const first = room.submitAction('A', { type: 'tick' }, 5);
    expect(first).toEqual({ ok: true, seq: 5 });
    // Same seq again
    const dup = room.submitAction('A', { type: 'tick' }, 5);
    expect(dup).toEqual({ ok: true, seq: 5 });
    // State unchanged (only one tick applied)
    expect(room.state).toMatchObject({ ticks: 1 });
  });

  it('duplicate seq stays idempotent even inside the throttle window', () => {
    // Default throttle 100ms — simulates a bot retrying immediately after a
    // network hiccup swallowed the first response.
    const logic = makeLogic({
      onAction(state, _action, playerID): ActionResult<State> {
        return { ok: true, state: { ...state, turn: playerID, ticks: state.ticks + 1 } };
      },
    });
    const room = new GameRoom('test', makeMeta(), undefined, logic);
    seatTwoPlayers(room);
    const first = room.submitAction('A', { type: 'tick' }, 5);
    expect(first).toEqual({ ok: true, seq: 5 });
    // Immediate retry with the same seq must NOT get THROTTLED — must be
    // treated as idempotent success.
    const dup = room.submitAction('A', { type: 'tick' }, 5);
    expect(dup).toEqual({ ok: true, seq: 5 });
    expect(room.state).toMatchObject({ ticks: 1 });
  });

  it('stale-seq returns the server-side seq, not the submitted one', () => {
    const room = setupRoom();
    room.submitAction('A', { type: 'tick' }, 5);
    // Confused client sends a far-older seq — response should tell them
    // where the server actually is (5), not echo back the stale 3.
    const stale = room.submitAction('A', { type: 'tick' }, 3);
    expect(stale).toEqual({ ok: true, seq: 5 });
  });

  it('returns THROTTLED when two actions arrive within the throttle window', () => {
    const logic = makeLogic({
      onAction(state, _action, playerID): ActionResult<State> {
        return { ok: true, state: { ...state, turn: playerID, ticks: state.ticks + 1 } };
      },
    });
    // Throttle 100ms — back-to-back calls must trip it
    const room = new GameRoom('test', makeMeta(), undefined, logic);
    seatTwoPlayers(room);
    const first = room.submitAction('A', { type: 'tick' });
    expect(first.ok).toBe(true);
    const second = room.submitAction('A', { type: 'tick' });
    expect(second).toMatchObject({ ok: false, error: 'THROTTLED' });
  });
});
