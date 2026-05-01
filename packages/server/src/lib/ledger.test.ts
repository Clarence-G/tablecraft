import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { createTestDb, type TestDb } from '../db/testing.js';


// We import recordPoints dynamically after mocking the db module so each test
// gets a fresh PGlite-backed db.
let recordPoints: typeof import('./ledger.js').recordPoints;

describe('recordPoints', () => {
  let db: TestDb['db'];
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();

    db = testDb.db;

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ recordPoints } = await import('./ledger.js'));
  });

  afterEach(async () => {
    await testDb.cleanup();
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

  it('writes a loss row (zero points) so the ledger doubles as a play log', async () => {
    await db.insert(schema.user).values({
      id: 'user_loss',
      name: 'L',
      email: 'l@example.com',
    });
    await recordPoints({
      userId: 'user_loss',
      guestId: null,
      gameId: 'gomoku',
      roomId: 'room_1',
      reason: 'loss',
    });
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.points).toBe(0);
    expect(rows[0]?.reason).toBe('loss');
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

describe('ensureDailyCheckin', () => {
  let db: TestDb['db'];
  let testDb: TestDb;
  let ensureDailyCheckin: typeof import('./ledger.js').ensureDailyCheckin;

  beforeEach(async () => {
    testDb = await createTestDb();

    db = testDb.db;

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ ensureDailyCheckin } = await import('./ledger.js'));

    await db.insert(schema.user).values({
      id: 'user_dc',
      name: 'Dan',
      email: 'dan@example.com',
    });
  });

  it('inserts daily_checkin row on first call', async () => {
    await ensureDailyCheckin('user_dc');
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('daily_checkin');
    expect(rows[0]?.points).toBe(5);
    expect(rows[0]?.gameId).toBe('daily');
  });

  it('is idempotent — second call same day inserts nothing', async () => {
    await ensureDailyCheckin('user_dc');
    await ensureDailyCheckin('user_dc');
    const rows = await db.select().from(schema.pointsLedger);
    expect(rows).toHaveLength(1);
  });
});