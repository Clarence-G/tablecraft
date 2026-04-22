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
 * Zero-point reasons (e.g. 'loss') short-circuit and write no row — keeps the
 * table small and lets callers pass through every participant uniformly.
 */
export async function recordPoints(entry: LedgerEntry): Promise<void> {
  const points = POINTS[entry.reason];
  if (points <= 0) return;
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
