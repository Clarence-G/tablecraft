import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLedger } from '../db/schema.js';
import { POINTS, type PointsReason } from './points.js';

export interface LedgerEntry {
  userId: string | null;
  guestId: string | null;
  gameId: string;
  roomId: string | null;
  reason: PointsReason;
}

/**
 * Insert one ledger row. Fire-and-forget: failures log to console but do not
 * throw, because a game is already over and re-doing is worse than dropping a
 * points row. Returns a promise the caller MAY await in tests; production
 * callers should NOT await (fire-and-forget).
 *
 * All entries are written — including zero-point `loss` rows — so the ledger
 * doubles as a "recently played" log. Aggregation queries that want real
 * earnings use `HAVING SUM(points) > 0` (see leaderboard).
 */
export async function recordPoints(entry: LedgerEntry): Promise<void> {
  const points = POINTS[entry.reason];
  try {
    await db.insert(pointsLedger).values({
      userId: entry.userId,
      guestId: entry.guestId,
      gameId: entry.gameId,
      roomId: entry.roomId,
      reason: entry.reason,
      points,
    });
  } catch (err) {
    console.error('[ledger] failed to record points entry', { entry, err });
  }
}

/**
 * Ensure the user has a `daily_checkin` ledger entry for today (UTC day).
 * Fire-and-forget: safe to call per-request. No-op when the user already
 * checked in today. Guests are skipped (no userId → no checkin).
 */
export async function ensureDailyCheckin(userId: string): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const existing = await db
      .select({ id: pointsLedger.id })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.reason, 'daily_checkin'),
          gte(pointsLedger.createdAt, todayStart),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
    await recordPoints({
      userId,
      guestId: null,
      gameId: 'daily',
      roomId: null,
      reason: 'daily_checkin',
    });
  } catch (err) {
    console.error('[ledger] daily checkin failed', { userId, err });
  }
}
