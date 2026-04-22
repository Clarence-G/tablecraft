import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { ActionResult, GameContext, GameLogic, GameMeta } from '@repo/shared';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { z } from 'zod';
import * as schema from '../db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, '../../drizzle');

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
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    const client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ GameRoom } = await import('./GameRoom.js'));
  });

  it('writes a win row only for the winner, skips bots, routes guest vs user', async () => {
    // Create a real user row for userA so the FK holds.
    await db.insert(schema.user).values({
      id: 'userA',
      name: 'User A',
      email: 'a@example.com',
    });

    // rankings: userA wins, guestB loses, botC is skipped
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

    // ledger writes are fire-and-forget — wait a microtask tick
    await new Promise((r) => setImmediate(r));

    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('userA');
    expect(rows[0]?.guestId).toBeNull();
    expect(rows[0]?.reason).toBe('win');
    expect(rows[0]?.gameId).toBe('test');
    expect(rows[0]?.roomId).toBe(room.roomId);
    expect(rows[0]?.points).toBe(10);
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
