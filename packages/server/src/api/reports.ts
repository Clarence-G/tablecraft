import { and, eq, sql } from 'drizzle-orm';
import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { reports, userBlocks } from '../db/schema.js';
import { logger } from '../lib/logger.js';

const reportSchema = z.object({
  targetUserId: z.string().min(1),
  roomId: z.string().optional(),
  reason: z.enum(['harassment', 'cheating', 'spam', 'other']),
  detail: z.string().max(500).optional(),
});

export function registerReportsRoutes(router: Router): void {
  // POST /api/reports — file a new report
  router.post('/reports', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', detail: parsed.error.flatten() } });
    }
    if (parsed.data.targetUserId === userId) {
      return void res.status(400).json({ ok: false, error: { code: 'SELF_REPORT' } });
    }

    // Rate limit: max 10 reports per hour per reporter
    const recent = await db.select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(
        eq(reports.reporterId, userId),
        sql`${reports.createdAt} > now() - interval '1 hour'`,
      ));
    if (Number(recent[0]?.n ?? 0) >= 10) {
      return void res.status(429).json({ ok: false, error: { code: 'TOO_MANY' } });
    }

    const [row] = await db.insert(reports).values({
      reporterId: userId,
      targetUserId: parsed.data.targetUserId,
      roomId: parsed.data.roomId,
      reason: parsed.data.reason,
      detail: parsed.data.detail,
    }).returning();
    logger.info({ reportId: row!.id, reporterId: userId, targetUserId: parsed.data.targetUserId, mod: 'moderation' }, 'report filed');
    res.json({ ok: true, data: { id: row!.id } });
  });

  // POST /api/reports/blocks — block a user
  router.post('/reports/blocks', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const { targetUserId } = req.body ?? {};
    if (!targetUserId || typeof targetUserId !== 'string') {
      return void res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST' } });
    }
    if (targetUserId === userId) {
      return void res.status(400).json({ ok: false, error: { code: 'SELF_BLOCK' } });
    }

    await db.insert(userBlocks).values({ blockerId: userId, blockedId: targetUserId })
      .onConflictDoNothing();
    res.json({ ok: true });
  });

  // DELETE /api/reports/blocks/:targetUserId — unblock
  router.delete('/reports/blocks/:targetUserId', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    await db.delete(userBlocks).where(and(
      eq(userBlocks.blockerId, userId),
      eq(userBlocks.blockedId, req.params.targetUserId),
    ));
    res.json({ ok: true });
  });

  // GET /api/reports/blocks — list blocked users
  router.get('/reports/blocks', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const rows = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, userId));
    res.json({ ok: true, data: rows.map(r => ({ userId: r.blockedId, createdAt: r.createdAt })) });
  });
}
