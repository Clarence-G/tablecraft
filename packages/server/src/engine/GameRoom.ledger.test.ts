import type { ActionResult, GameContext, GameLogic, GameMeta } from '@repo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { z } from 'zod';
import * as schema from '../db/schema';
import { createTestDb, type TestDb } from '../db/testing.js';


// Dynamically imported after mocking db so GameRoom pulls the test db too.
let GameRoom: typeof import('./GameRoom.js').GameRoom;

// Logic that immediately ends the game on the first action, with a
// configurable rankings array provided via config.
const ActionSchema = z.object({ type: z.literal('end') });
type Action = z.infer<typeof ActionSchema>;
interface State {
  over: boolean;
}
function makeEndGameLogic(rankings: string[]): GameLogic<State, Action, State> {
  return {
    actions: ActionSchema,
    setup(): State {
      return { over: false };
    },
    onAction(_state, _action, _playerID, _ctx: GameContext): ActionResult<State> {
      return {
        ok: true,
        state: { over: true },
        events: [{ type: 'END_GAME', rankings }],
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
});
