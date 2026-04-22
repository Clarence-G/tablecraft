import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, '../../drizzle');

// We import recordPoints dynamically after mocking the db module so each test
// gets a fresh PGlite-backed db.
let recordPoints: typeof import('./ledger.js').recordPoints;

describe('recordPoints', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    const client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ recordPoints } = await import('./ledger.js'));
  });

  it('writes a win row for a logged-in user', async () => {
    // FK on user_id requires a real user row.
    await db.insert(schema.user).values({
      id: 'user_abc',
      name: 'Alice',
      email: 'alice@example.com',
    });
    await recordPoints({
      userId: 'user_abc',
      guestId: null,
      gameId: 'gomoku',
      roomId: 'room_1',
      reason: 'win',
    });
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('user_abc');
    expect(rows[0]?.guestId).toBeNull();
    expect(rows[0]?.reason).toBe('win');
    expect(rows[0]?.points).toBe(10);
  });

  it('writes a draw row for a guest', async () => {
    await recordPoints({
      userId: null,
      guestId: 'guest_xyz',
      gameId: 'uno',
      roomId: 'room_2',
      reason: 'draw',
    });
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.guestId).toBe('guest_xyz');
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.points).toBe(3);
  });

  it('skips loss reason (zero points → no row)', async () => {
    await recordPoints({
      userId: null,
      guestId: 'guest_xyz',
      gameId: 'gomoku',
      roomId: 'room_1',
      reason: 'loss',
    });
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(0);
  });

  it('writes daily_checkin row with null roomId', async () => {
    await recordPoints({
      userId: null,
      guestId: 'guest_xyz',
      gameId: 'daily',
      roomId: null,
      reason: 'daily_checkin',
    });
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roomId).toBeNull();
    expect(rows[0]?.points).toBe(5);
  });

  it('fails silently on DB error (does not throw)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Neither userId nor guestId → CHECK constraint violation.
    await expect(
      recordPoints({
        userId: null,
        guestId: null,
        gameId: 'gomoku',
        roomId: null,
        reason: 'win',
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
