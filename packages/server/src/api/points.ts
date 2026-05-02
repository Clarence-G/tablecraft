import { and, desc, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Request, Response, Router } from 'express';
import { db } from '../db/index.js';
import { botTokens, pointsLedger, user } from '../db/schema.js';
import { TokenStore } from './token-store.js';

/**
 * Points + leaderboard + claim-guest endpoints. Spec §5.3.
 *
 * Error shape for *these* routes is `{ ok: false, error: { code, message } }`
 * per spec §5.4. This differs from the legacy bot-flow routes in `router.ts`
 * which use a flatter `{ ok: false, error: CODE, message, hint }` shape;
 * we keep the new shape only for the new points routes to avoid breaking
 * existing CLI clients.
 */

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, error: { code, message } });
}

/**
 * Detect a PG unique-violation (SQLSTATE 23505) on the `user.claimed_guest_id`
 * column. postgres-js exposes `code` and `constraint_name` fields directly;
 * some wrapper layers nest the original on `cause`. We check both,
 * then fall back to a message substring as belt-and-suspenders.
 */
function isClaimedGuestIdUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
  const matchesConstraint = (code: unknown, constraint: unknown): boolean =>
    code === '23505' &&
    (constraint === 'user_claimed_guest_id_unique' || constraint === 'claimed_guest_id');
  if (matchesConstraint(e.code, e.constraint)) return true;
  if (e.cause && typeof e.cause === 'object') {
    const c = e.cause as { code?: unknown; constraint?: unknown };
    if (matchesConstraint(c.code, c.constraint)) return true;
  }
  // Fallback: message mentions both the SQLSTATE hallmark phrase and our column.
  if (
    typeof e.message === 'string' &&
    e.message.includes('duplicate key value violates unique constraint') &&
    e.message.includes('claimed_guest_id')
  ) {
    return true;
  }
  return false;
}

interface PointsSummary {
  global: number;
  byGame: Record<string, number>;
}

/**
 * Aggregate a points summary for a given owner. The two filter shapes
 * (user_id vs guest_id) both benefit from the existing indexes
 * `idx_points_user_created` / `idx_points_guest`.
 */
async function fetchPointsSummary(filter: {
  userId?: string;
  guestId?: string;
}): Promise<PointsSummary> {
  const whereClause =
    filter.userId !== undefined
      ? eq(pointsLedger.userId, filter.userId)
      : eq(pointsLedger.guestId, filter.guestId ?? '');

  const rows = await db
    .select({
      gameId: pointsLedger.gameId,
      total: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)::int`.as('total'),
    })
    .from(pointsLedger)
    .where(whereClause)
    .groupBy(pointsLedger.gameId);

  let global = 0;
  const byGame: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r.total);
    byGame[r.gameId] = n;
    global += n;
  }
  return { global, byGame };
}

export function registerPointsRoutes(router: Router): void {
  // GET /api/me — current session's profile + points summary + owned bots.
  router.get('/me', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }

    const tokenStore = new TokenStore(db);
    const [points, bots] = await Promise.all([
      fetchPointsSummary({ userId: session.user.id }),
      tokenStore.listByOwner(session.user.id),
    ]);
    const safeUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    };
    // Recently played: last 5 distinct rooms the user participated in. Each
    // ledger row maps 1:1 to one game outcome for that user, so taking the
    // newest row per (gameId, roomId) is the simplest stable ordering.
    const recentRows = await db
      .select({
        gameId: pointsLedger.gameId,
        roomId: pointsLedger.roomId,
        reason: pointsLedger.reason,
        endedAt: pointsLedger.createdAt,
      })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.userId, session.user.id),
          ne(pointsLedger.reason, 'daily_checkin'),
          isNotNull(pointsLedger.roomId),
        ),
      )
      .orderBy(desc(pointsLedger.createdAt))
      .limit(5);
    const recentGames = recentRows.map((r) => ({
      gameId: r.gameId,
      roomId: r.roomId,
      result: r.reason, // 'win' | 'loss' | 'draw'
      endedAt: r.endedAt,
    }));
    res.json({ ok: true, data: { user: safeUser, points, recentGames, bots } });
  });

  // GET /api/guest/:guestId/points — public read of a guest's summary.
  // Unknown guest → zeros, not 404 (matches the spec's "return zeros"
  // directive and keeps the client's unified "show a number" UI simple).
  router.get('/guest/:guestId/points', async (req: Request, res: Response) => {
    const points = await fetchPointsSummary({ guestId: req.params.guestId });
    res.json({ ok: true, data: points });
  });

  // POST /api/me/claim-guest — one-shot merge of a guest's ledger rows
  // into the signed-in user. First-come-first-served on both sides
  // (user has not claimed yet, guestId not already claimed). Spec §4.3.
  router.post('/me/claim-guest', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }

    const guestId = req.body?.guestId;
    if (!guestId || typeof guestId !== 'string') {
      sendError(res, 400, 'INVALID_BODY', 'guestId is required');
      return;
    }

    const userId = session.user.id;

    // Guard 1: this user already claimed a guest.
    const [currentUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!currentUser) {
      sendError(res, 401, 'UNAUTHORIZED', 'User row missing');
      return;
    }
    if (currentUser.claimedGuestId) {
      sendError(res, 409, 'ALREADY_CLAIMED', 'This account has already merged a guest');
      return;
    }

    // Guard 2: the guestId has been claimed by someone else.
    const [other] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.claimedGuestId, guestId))
      .limit(1);
    if (other) {
      sendError(
        res,
        409,
        'GUEST_ALREADY_CLAIMED',
        'This guest has been merged into another account',
      );
      return;
    }

    // Transactional merge. PGlite's drizzle adapter supports `db.transaction`.
    // The pre-checks above race: two concurrent requests can both pass them,
    // then one hits the `user.claimed_guest_id` UNIQUE constraint inside the
    // tx. Catch PG 23505 on that specific constraint and surface it as a 409
    // instead of letting it bubble to the default 500 handler.
    let result: number;
    try {
      result = await db.transaction(async (tx) => {
        const updated = await tx
          .update(pointsLedger)
          .set({ userId, guestId: null })
          .where(and(eq(pointsLedger.guestId, guestId), isNull(pointsLedger.userId)))
          .returning({ id: pointsLedger.id });
        await tx.update(user).set({ claimedGuestId: guestId }).where(eq(user.id, userId));
        return updated.length;
      });
    } catch (err) {
      if (isClaimedGuestIdUniqueViolation(err)) {
        sendError(
          res,
          409,
          'GUEST_ALREADY_CLAIMED',
          'This guest has been merged into another account',
        );
        return;
      }
      throw err;
    }

    res.json({ ok: true, data: { mergedRows: result } });
  });

  // GET /api/leaderboard — top-N by points. Includes both human users and bots.
  // Entries where isBot=true carry the bot's name and ownerName.
  // Excludes guest-only rows (user_id IS NULL).
  router.get('/leaderboard', async (req: Request, res: Response) => {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
    const limitParam = Number(req.query.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);

    // period: 'all' (default) | 'week' (last 7d) | 'day' (last 24h).
    const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'all';
    const period = rawPeriod === 'week' || rawPeriod === 'day' ? rawPeriod : 'all';
    const now = Date.now();
    const sinceMs =
      period === 'week' ? now - 7 * 24 * 60 * 60 * 1000 : period === 'day' ? now - 24 * 60 * 60 * 1000 : null;
    const since = sinceMs !== null ? new Date(sinceMs) : null;

    const conditions = [isNotNull(pointsLedger.userId)];
    if (gameId) conditions.push(eq(pointsLedger.gameId, gameId));
    if (since) conditions.push(gte(pointsLedger.createdAt, since));
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const pointsSubquery = db
      .select({
        userId: pointsLedger.userId,
        total: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)::int`.as('total'),
      })
      .from(pointsLedger)
      .where(whereClause)
      .groupBy(pointsLedger.userId)
      .having(sql`SUM(${pointsLedger.points}) > 0`)
      .as('sub');

    const rows = await db
      .select({
        userId: pointsSubquery.userId,
        name: sql<string>`COALESCE(${user.name}, ${botTokens.name}, ${pointsSubquery.userId})`,
        total: pointsSubquery.total,
        isBot: sql<boolean>`(${botTokens.userId} IS NOT NULL)`,
        // Scalar subquery for owner name avoids a second alias on the user table
        ownerName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${botTokens.ownerUserId})`,
      })
      .from(pointsSubquery)
      .leftJoin(user, eq(user.id, pointsSubquery.userId))
      .leftJoin(botTokens, eq(botTokens.userId, pointsSubquery.userId))
      .orderBy(desc(pointsSubquery.total))
      .limit(limit);

    // total = number of distinct users/bots with > 0 earned points.
    const totalSub = db
      .select({ userId: pointsLedger.userId })
      .from(pointsLedger)
      .where(whereClause)
      .groupBy(pointsLedger.userId)
      .having(sql`SUM(${pointsLedger.points}) > 0`)
      .as('scored');
    const totalRows = await db.select({ total: sql<number>`COUNT(*)::int` }).from(totalSub);
    const total = Number(totalRows[0]?.total ?? 0);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId as string,
      name: r.name,
      points: Number(r.total),
      isBot: Boolean(r.isBot),
      ownerName: r.ownerName ?? null,
    }));
    res.json({ ok: true, data: { entries, total } });
  });

  // GET /api/leaderboard/me — rank + points + total for the caller.
  // Session-authenticated; optional `?guestId=` lets a logged-out client ask
  // about its guest identity. Rank = "how many users have strictly more
  // points than me"; `null` if I have zero points (not in the ranking).
  router.get('/leaderboard/me', async (req: Request, res: Response) => {
    const session = req.session;
    const queryGuestId = typeof req.query.guestId === 'string' ? req.query.guestId : undefined;
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;

    let ownerFilter: { userId?: string; guestId?: string };
    let isUser = false;
    if (session) {
      ownerFilter = { userId: session.user.id };
      isUser = true;
    } else if (queryGuestId) {
      ownerFilter = { guestId: queryGuestId };
    } else {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in or pass guestId');
      return;
    }

    const gameScope = gameId ? eq(pointsLedger.gameId, gameId) : undefined;

    const ownerWhere =
      ownerFilter.userId !== undefined
        ? and(eq(pointsLedger.userId, ownerFilter.userId), gameScope)
        : and(eq(pointsLedger.guestId, ownerFilter.guestId ?? ''), gameScope);

    const [pointsRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)::int` })
      .from(pointsLedger)
      .where(ownerWhere);
    const myPoints = Number(pointsRow?.total ?? 0);

    // Leaderboard only ranks real users with > 0 earned points.
    if (!isUser || myPoints === 0) {
      const scoredSub = db
        .select({ userId: pointsLedger.userId })
        .from(pointsLedger)
        .where(
          gameId
            ? and(isNotNull(pointsLedger.userId), eq(pointsLedger.gameId, gameId))
            : isNotNull(pointsLedger.userId),
        )
        .groupBy(pointsLedger.userId)
        .having(sql`SUM(${pointsLedger.points}) > 0`)
        .as('scored_me');
      const totalRows = await db.select({ total: sql<number>`COUNT(*)::int` }).from(scoredSub);
      res.json({
        ok: true,
        data: { rank: null, points: myPoints, total: Number(totalRows[0]?.total ?? 0) },
      });
      return;
    }

    // Count distinct users with a strictly higher sum (and > 0 earned points).
    const rankRows = await db
      .select({
        userId: pointsLedger.userId,
        total: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)::int`.as('total'),
      })
      .from(pointsLedger)
      .where(
        gameId
          ? and(isNotNull(pointsLedger.userId), eq(pointsLedger.gameId, gameId))
          : isNotNull(pointsLedger.userId),
      )
      .groupBy(pointsLedger.userId)
      .having(sql`SUM(${pointsLedger.points}) > 0`);

    const totalUsers = rankRows.length;
    const aboveMe = rankRows.filter((r) => Number(r.total) > myPoints).length;
    res.json({
      ok: true,
      data: { rank: aboveMe + 1, points: myPoints, total: totalUsers },
    });
  });
}
