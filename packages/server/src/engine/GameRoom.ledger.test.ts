import type { ActionResult, GameContext, GameLogic, GameMeta } from '@repo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type TestDb, createTestDb } from '../db/testing.js';

// Dynamically imported after mocking db so GameRoom pulls the test db too.
let GameRoom: typeof import('./GameRoom.js').GameRoom;

// Logic that immediately ends the game on the first action, with a
// configurable rankings array provided via config.
const ActionSchema = z.object({ type: z.literal('end') });
type Action = z.infer<typeof ActionSchema>;
interface State {
  over: boolean;
}
function makeEndGameLogic(rankings: string[], ties?: string[][]): GameLogic<State, Action, State> {
  return {
    actions: ActionSchema,
    setup(): State {
      return { over: false };
    },
    onAction(_state, _action, _playerID, _ctx: GameContext): ActionResult<State> {
      return {
        ok: true,
        state: { over: true },
        events: [{ type: 'END_GAME', rankings, ...(ties !== undefined && { ties }) }],
      };
    },
    getPlayerView(state): State {
      return state;
    },
  };
}
const meta: GameMeta = {
  id: 'test',
  name: 'Test',
  description: '',
  minPlayers: 3,
  maxPlayers: 3,
  actionThrottleMs: 0,
};

describe('GameRoom END_GAME → points_ledger integration', () => {
  let db: TestDb['db'];
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();

    db = testDb.db;

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ GameRoom } = await import('./GameRoom.js'));
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('writes win row for winner, routes guest vs user; bots get ledger rows', async () => {
    // Create a real user row for userA.
    await db.insert(schema.user).values({
      id: 'userA',
      name: 'User A',
      email: 'a@example.com',
    });

    // rankings: userA wins, guestB loses, botC loses (bot now participates)
    const logic = makeEndGameLogic(['userA', 'guestB', 'botC']);
    const room = new GameRoom('test', meta, undefined, logic);

    room.join('userA', 'User A', false, /* isGuest */ false);
    room.join('guestB', 'Guest B', false, /* isGuest */ true);
    room.join('botC', 'Bot C', /* isBot */ true);
    room.ready('userA');
    room.ready('guestB');
    // botC auto-readied
    room.start();

    room.handleAction('userA', { type: 'end' }, 1);

    // Poll until 3 rows land (userA win, guestB loss, botC loss)
    let rows: Array<typeof schema.pointsLedger.$inferSelect> = [];
    for (let i = 0; i < 50; i++) {
      rows = await db.select().from(schema.pointsLedger).orderBy(schema.pointsLedger.reason);
      if (rows.length >= 3) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(rows).toHaveLength(3);

    const win = rows.find((r) => r.reason === 'win');
    expect(win?.userId).toBe('userA');
    expect(win?.guestId).toBeNull();
    expect(win?.points).toBe(10);
    expect(win?.roomId).toBe(room.roomId);

    const guestLoss = rows.find((r) => r.guestId === 'guestB');
    expect(guestLoss?.userId).toBeNull();
    expect(guestLoss?.points).toBe(0);

    // Bot row: userId = bot id, guestId = null
    const botLoss = rows.find((r) => r.userId === 'botC');
    expect(botLoss).toBeDefined();
    expect(botLoss?.guestId).toBeNull();
    expect(botLoss?.points).toBe(0);
    expect(botLoss?.reason).toBe('loss');
  });

  it('bot winner gets a win row with userId = bot id', async () => {
    const logic = makeEndGameLogic(['bot_winner', 'guestB', 'guestC']);
    const room = new GameRoom('test', meta, undefined, logic);

    room.join('bot_winner', 'Bot', /* isBot */ true);
    room.join('guestB', 'B', false, true);
    room.join('guestC', 'C', false, true);
    room.ready('guestB');
    room.ready('guestC');
    room.start();

    room.handleAction('bot_winner', { type: 'end' }, 1);

    let rows: Array<typeof schema.pointsLedger.$inferSelect> = [];
    for (let i = 0; i < 50; i++) {
      rows = await db.select().from(schema.pointsLedger);
      if (rows.length >= 3) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const botWin = rows.find((r) => r.userId === 'bot_winner');
    expect(botWin).toBeDefined();
    expect(botWin?.guestId).toBeNull();
    expect(botWin?.reason).toBe('win');
    expect(botWin?.points).toBe(10);
  });

  it('writes no rows when rankings is empty', async () => {
    const logic = makeEndGameLogic([]);
    const room = new GameRoom('test', meta, undefined, logic);
    room.join('guestA', 'A', false, true);
    room.join('guestB', 'B', false, true);
    room.join('guestC', 'C', false, true);
    room.ready('guestA');
    room.ready('guestB');
    room.ready('guestC');
    room.start();

    room.handleAction('guestA', { type: 'end' }, 1);
    await new Promise((r) => setImmediate(r));

    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(0);
  });

  it("rankings ['A','B'] with no ties yields A:win, B:loss", async () => {
    const twoPlayerMeta: GameMeta = { ...meta, minPlayers: 2, maxPlayers: 2 };
    const logic = makeEndGameLogic(['guestA', 'guestB']);
    const room = new GameRoom('test', twoPlayerMeta, undefined, logic);
    room.join('guestA', 'A', false, true);
    room.join('guestB', 'B', false, true);
    room.ready('guestA');
    room.ready('guestB');
    room.start();

    room.handleAction('guestA', { type: 'end' }, 1);

    let rows: Array<typeof schema.pointsLedger.$inferSelect> = [];
    for (let i = 0; i < 50; i++) {
      rows = await db.select().from(schema.pointsLedger);
      if (rows.length >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(rows).toHaveLength(2);
    const rowA = rows.find((r) => r.guestId === 'guestA');
    const rowB = rows.find((r) => r.guestId === 'guestB');
    expect(rowA?.reason).toBe('win');
    expect(rowA?.points).toBe(10);
    expect(rowB?.reason).toBe('loss');
    expect(rowB?.points).toBe(0);
  });

  it("rankings ['A','B'] with ties=[['A','B']] yields A:draw, B:draw", async () => {
    const twoPlayerMeta: GameMeta = { ...meta, minPlayers: 2, maxPlayers: 2 };
    const logic = makeEndGameLogic(['guestA', 'guestB'], [['guestA', 'guestB']]);
    const room = new GameRoom('test', twoPlayerMeta, undefined, logic);
    room.join('guestA', 'A', false, true);
    room.join('guestB', 'B', false, true);
    room.ready('guestA');
    room.ready('guestB');
    room.start();

    room.handleAction('guestA', { type: 'end' }, 1);

    let rows: Array<typeof schema.pointsLedger.$inferSelect> = [];
    for (let i = 0; i < 50; i++) {
      rows = await db.select().from(schema.pointsLedger);
      if (rows.length >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(rows).toHaveLength(2);
    const rowA = rows.find((r) => r.guestId === 'guestA');
    const rowB = rows.find((r) => r.guestId === 'guestB');
    expect(rowA?.reason).toBe('draw');
    expect(rowA?.points).toBe(3);
    expect(rowB?.reason).toBe('draw');
    expect(rowB?.points).toBe(3);
  });

  describe('game:over socket event', () => {
    interface EmittedEvent {
      playerID: string;
      event: string;
      data: unknown;
    }

    function setupRoomWithEmitCapture(
      m: GameMeta,
      logic: GameLogic<State, Action, State>,
      players: Array<[string, string, boolean /*isGuest*/]>,
    ) {
      const room = new GameRoom('test', m, undefined, logic);
      const emits: EmittedEvent[] = [];
      room.emitToPlayer = (playerID, event, data) => {
        emits.push({ playerID, event, data });
      };
      for (const [id, name, isGuest] of players) {
        room.join(id, name, /* isBot */ false, isGuest);
        room.ready(id);
      }
      room.start();
      return { room, emits };
    }

    it('emits game:over with win/loss pointsDelta to every player', () => {
      const twoPlayerMeta: GameMeta = { ...meta, minPlayers: 2, maxPlayers: 2 };
      const logic = makeEndGameLogic(['guestA', 'guestB']);
      const { room, emits } = setupRoomWithEmitCapture(twoPlayerMeta, logic, [
        ['guestA', 'A', true],
        ['guestB', 'B', true],
      ]);

      room.handleAction('guestA', { type: 'end' }, 1);

      const overEvents = emits.filter((e) => e.event === 'game:over');
      expect(overEvents).toHaveLength(2);
      const recipients = new Set(overEvents.map((e) => e.playerID));
      expect(recipients).toEqual(new Set(['guestA', 'guestB']));
      // Every recipient sees the same payload.
      for (const ev of overEvents) {
        expect(ev.data).toEqual({
          rankings: ['guestA', 'guestB'],
          pointsDelta: { guestA: 10, guestB: 0 },
        });
      }
    });

    it('emits game:over with draw pointsDelta when ties cover the winner', () => {
      const twoPlayerMeta: GameMeta = { ...meta, minPlayers: 2, maxPlayers: 2 };
      const logic = makeEndGameLogic(['guestA', 'guestB'], [['guestA', 'guestB']]);
      const { room, emits } = setupRoomWithEmitCapture(twoPlayerMeta, logic, [
        ['guestA', 'A', true],
        ['guestB', 'B', true],
      ]);

      room.handleAction('guestA', { type: 'end' }, 1);

      const overEvents = emits.filter((e) => e.event === 'game:over');
      expect(overEvents).toHaveLength(2);
      for (const ev of overEvents) {
        expect(ev.data).toEqual({
          rankings: ['guestA', 'guestB'],
          ties: [['guestA', 'guestB']],
          pointsDelta: { guestA: 3, guestB: 3 },
        });
      }
    });

    it('emits game:over after game:end so clients can overwrite with delta', () => {
      const twoPlayerMeta: GameMeta = { ...meta, minPlayers: 2, maxPlayers: 2 };
      const logic = makeEndGameLogic(['guestA', 'guestB']);
      const { room, emits } = setupRoomWithEmitCapture(twoPlayerMeta, logic, [
        ['guestA', 'A', true],
        ['guestB', 'B', true],
      ]);

      room.handleAction('guestA', { type: 'end' }, 1);

      const firstEndIdx = emits.findIndex((e) => e.event === 'game:end');
      const firstOverIdx = emits.findIndex((e) => e.event === 'game:over');
      expect(firstEndIdx).toBeGreaterThanOrEqual(0);
      expect(firstOverIdx).toBeGreaterThan(firstEndIdx);
    });

    it('still emits game:over with empty pointsDelta when rankings is empty', () => {
      const logic = makeEndGameLogic([]);
      const { room, emits } = setupRoomWithEmitCapture(meta, logic, [
        ['guestA', 'A', true],
        ['guestB', 'B', true],
        ['guestC', 'C', true],
      ]);

      room.handleAction('guestA', { type: 'end' }, 1);

      // Empty rankings → no ledger rows and an empty pointsDelta. We still emit
      // game:over (additive to game:end) with an empty delta so a client that
      // listens only to game:over still sees the match-end signal.
      const overEvents = emits.filter((e) => e.event === 'game:over');
      expect(overEvents).toHaveLength(3);
      for (const ev of overEvents) {
        expect(ev.data).toEqual({ rankings: [], pointsDelta: {} });
      }
    });
  });
});
