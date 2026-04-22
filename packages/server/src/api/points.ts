import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Request, Response, Router } from 'express';
import { db } from '../db/index.js';
import { pointsLedger, user } from '../db/schema.js';

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
  // GET /api/me — current session's profile + points summary.
  router.get('/me', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }

    const points = await fetchPointsSummary({ userId: session.user.id });
    const safeUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    };
    // recentGames is a stub for Stage 7 — surface the key so clients can
    // code against the final shape without branching.
    res.json({ ok: true, data: { user: safeUser, points, recentGames: [] } });
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
    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(pointsLedger)
        .set({ userId, guestId: null })
        .where(and(eq(pointsLedger.guestId, guestId), isNull(pointsLedger.userId)))
        .returning({ id: pointsLedger.id });
      await tx.update(user).set({ claimedGuestId: guestId }).where(eq(user.id, userId));
      return updated.length;
    });

    res.json({ ok: true, data: { mergedRows: result } });
  });

  // GET /api/leaderboard — public top-N by points (sum per user). Optionally
  // scoped to a gameId. Excludes guest-only rows (user_id IS NULL).
  router.get('/leaderboard', async (req: Request, res: Response) => {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
    const limitParam = Number(req.query.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);

    const whereClause = gameId
      ? and(isNotNull(pointsLedger.userId), eq(pointsLedger.gameId, gameId))
      : isNotNull(pointsLedger.userId);

    const pointsSubquery = db
      .select({
        userId: pointsLedger.userId,
        total: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)::int`.as('total'),
      })
      .from(pointsLedger)
      .where(whereClause)
      .groupBy(pointsLedger.userId)
      .as('sub');

    const rows = await db
      .select({
        userId: pointsSubquery.userId,
        name: user.name,
        total: pointsSubquery.total,
      })
      .from(pointsSubquery)
      .innerJoin(user, eq(user.id, pointsSubquery.userId))
      .orderBy(desc(pointsSubquery.total))
      .limit(limit);

    // total = number of distinct scored users (matches "Unranked out of N" UX).
    const totalRows = await db
      .select({ total: sql<number>`COUNT(DISTINCT ${pointsLedger.userId})::int` })
      .from(pointsLedger)
      .where(whereClause);
    const total = Number(totalRows[0]?.total ?? 0);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId as string,
      name: r.name,
      points: Number(r.total),
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

    // Leaderboard only ranks real users; guest callers never have a rank.
    if (!isUser || myPoints === 0) {
      const totalRows = await db
        .select({ total: sql<number>`COUNT(DISTINCT ${pointsLedger.userId})::int` })
        .from(pointsLedger)
        .where(
          gameId
            ? and(isNotNull(pointsLedger.userId), eq(pointsLedger.gameId, gameId))
            : isNotNull(pointsLedger.userId),
        );
      res.json({
        ok: true,
        data: { rank: null, points: myPoints, total: Number(totalRows[0]?.total ?? 0) },
      });
      return;
    }

    // Count distinct users with a strictly higher sum.
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
      .groupBy(pointsLedger.userId);

    const totalUsers = rankRows.length;
    const aboveMe = rankRows.filter((r) => Number(r.total) > myPoints).length;
    res.json({
      ok: true,
      data: { rank: aboveMe + 1, points: myPoints, total: totalUsers },
    });
  });
}
