# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# STAGE 2-D: Moderation — reports, blocks, chat sensitive-word filter

You are the **moderation worker**. You add the ability to report and block other users, plus a chat pre-filter for banned words.

## Context

Stage 1 has added:
- `reports`, `userBlocks` tables in schema
- Migration `0004_*.sql`
- pino logger at `lib/logger.ts`

Your scope: REST endpoints for reports/blocks, chat content filter, minimal UI entry point.

## Read FIRST

1. `CLAUDE.md`
2. `packages/server/src/db/schema.ts` — confirm `reports` and `userBlocks` exist (Stage 1 added them)
3. `packages/server/src/api/router.ts` — router pattern (module takes `db` param, returns `Router`)
4. `packages/server/src/api/points.ts` — reference for creating a sub-router module
5. `packages/server/src/socket/handlers.ts` — ONLY the `chat:send` handler (do NOT touch disconnect — Stage 2-B owns that)
6. `packages/client/src/pages/Game.tsx` or Room.tsx — find where chat UI is rendered (so you know where to add report button)

## What to build

### A. `packages/server/src/lib/moderation.ts` — sensitive word filter

```ts
import { logger } from './logger';

/**
 * Curated small banned-word list. Covers common CN slurs + EN profanity
 * at a minimum viable level. Not exhaustive — augment via ops when needed.
 * Matched case-insensitively; CJK exact-match; filtered as whole word for
 * ASCII latin, substring for CJK.
 */
const BANNED_WORDS_CN: string[] = [
  // fill with ~30 common CN slurs; DO NOT be cute, be prudent
  '傻逼', '操你', '草你', '妈的', '白痴', '滚蛋', '垃圾', '弱智', '智障',
  '婊子', '贱人', '狗屁', '滚开', '去死', '死全家', '日你', '你妈',
];

const BANNED_WORDS_EN: string[] = [
  // common EN profanity (whole-word)
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'faggot', 'nigger', 'retard',
];

export interface ModerationResult {
  ok: boolean;
  reason?: 'banned_word';
  filteredText?: string;  // text with banned words masked as '***'
  match?: string;
}

export function moderateChat(text: string): ModerationResult {
  const lowered = text.toLowerCase();
  // CJK: substring
  for (const w of BANNED_WORDS_CN) {
    if (text.includes(w)) {
      return { ok: false, reason: 'banned_word', match: w, filteredText: mask(text, w) };
    }
  }
  // EN: whole-word via word-boundary regex
  for (const w of BANNED_WORDS_EN) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    if (re.test(lowered)) {
      return { ok: false, reason: 'banned_word', match: w, filteredText: text.replace(re, '***') };
    }
  }
  return { ok: true };
}

function mask(text: string, word: string): string {
  return text.split(word).join('***');
}
```

### B. Add chat filter in `socket/handlers.ts`

Find the `chat:send` handler. **Surgical change** — add filter BEFORE the broadcast:

```ts
socket.on('chat:send', (rawText) => {
  // ... existing length + rate-limit checks ...
  const mod = moderateChat(rawText);
  if (!mod.ok) {
    logger.info({ userId: socket.data.userId, match: mod.match, mod: 'moderation' },
                'chat message blocked');
    // Tell the sender privately it was blocked; do NOT broadcast.
    socket.emit('chat:blocked', { reason: mod.reason });
    return;
  }
  // ... existing broadcast ...
});
```

This is the only socket change. DO NOT touch anything else in socket/handlers.ts. Stage 2-B is editing disconnect/chat-persistence in parallel — if you see their edits already present, integrate around them carefully. If there's a merge conflict later, orchestrator resolves.

### C. `packages/server/src/api/reports.ts` — new REST module

Signature matches `api/points.ts`:

```ts
import type { Database } from '../db';
import type { Request, Response, Router as ExpressRouter } from 'express';
import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { reports, userBlocks } from '../db/schema';
import { logger } from '../lib/logger';
import { z } from 'zod';

export function createReportsRouter(db: Database): ExpressRouter {
  const router = Router();

  const reportSchema = z.object({
    targetUserId: z.string().min(1),
    roomId: z.string().optional(),
    reason: z.enum(['harassment', 'cheating', 'spam', 'other']),
    detail: z.string().max(500).optional(),
  });

  // POST /api/reports — submit a new report
  router.post('/', async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', detail: parsed.error.flatten() } });
    }
    if (parsed.data.targetUserId === userId) {
      return res.status(400).json({ ok: false, error: { code: 'SELF_REPORT' } });
    }
    // Rate-limit: max 10 reports per user per hour
    const recent = await db.select({ n: sql<number>`count(*)` })
      .from(reports)
      .where(and(
        eq(reports.reporterId, userId),
        sql`${reports.createdAt} > now() - interval '1 hour'`,
      ));
    if ((recent[0]?.n || 0) >= 10) {
      return res.status(429).json({ ok: false, error: { code: 'TOO_MANY' } });
    }
    const [row] = await db.insert(reports).values({
      reporterId: userId,
      targetUserId: parsed.data.targetUserId,
      roomId: parsed.data.roomId,
      reason: parsed.data.reason,
      detail: parsed.data.detail,
    }).returning();
    logger.info({ reportId: row.id, reporterId: userId, targetUserId: parsed.data.targetUserId, mod: 'moderation' },
                'report filed');
    res.json({ ok: true, data: { id: row.id } });
  });

  // POST /api/blocks — block a user
  router.post('/blocks', async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });
    const { targetUserId } = req.body || {};
    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST' } });
    }
    if (targetUserId === userId) {
      return res.status(400).json({ ok: false, error: { code: 'SELF_BLOCK' } });
    }
    await db.insert(userBlocks).values({ blockerId: userId, blockedId: targetUserId })
      .onConflictDoNothing().execute();
    res.json({ ok: true });
  });

  // DELETE /api/blocks/:targetUserId — unblock
  router.delete('/blocks/:targetUserId', async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });
    const targetUserId = req.params.targetUserId;
    await db.delete(userBlocks).where(and(
      eq(userBlocks.blockerId, userId),
      eq(userBlocks.blockedId, targetUserId),
    )).execute();
    res.json({ ok: true });
  });

  // GET /api/blocks — list blocked users
  router.get('/blocks', async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });
    const rows = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, userId));
    res.json({ ok: true, data: rows.map(r => ({ userId: r.blockedId, createdAt: r.createdAt })) });
  });

  return router;
}
```

### D. Mount in `router.ts`

In `packages/server/src/api/router.ts`, find where `points` router is mounted:
```ts
router.use('/points', createPointsRouter(db));
// ADD:
router.use('/reports', createReportsRouter(db));
```

(Blocks endpoints live under `/reports/blocks*` via this mount.)

### E. Minimal client UI

Don't add a full moderation dashboard. Just two entry points:

1. In `packages/client/src/components/` or wherever chat is rendered, add a **context menu on each chat message** (right-click or tap-hold) with "举报" / "Report" and "拉黑" / "Block" actions. Use shadcn `DropdownMenu` or similar.

2. Both actions open a confirm dialog (`Dialog` from shadcn), submit via fetch to `/api/reports` or `/api/reports/blocks`.

Keep UI minimal — existing design tokens, i18n keys for all strings.

### F. i18n

Add to `client/src/i18n/locales/{zh,en}/common.json`:
```json
{
  "moderation": {
    "report": "举报" / "Report",
    "block": "拉黑" / "Block",
    "reportTitle": "举报玩家" / "Report player",
    "reportReasonLabel": "举报原因" / "Reason",
    "reasonHarassment": "骚扰" / "Harassment",
    "reasonCheating": "作弊" / "Cheating",
    "reasonSpam": "刷屏 / 广告" / "Spam",
    "reasonOther": "其他" / "Other",
    "reportDetailLabel": "详情（可选）" / "Details (optional)",
    "reportSubmit": "提交" / "Submit",
    "reportSuccess": "已收到，感谢反馈" / "Reported — thanks",
    "blockConfirm": "拉黑后你将不再看到该玩家的消息" / "You won't see messages from this player",
    "blockSubmit": "确认拉黑" / "Block",
    "blockSuccess": "已拉黑" / "Blocked",
    "chatBlocked": "消息包含不当内容" / "Message blocked — contains inappropriate content"
  }
}
```

### G. Tests

1. `packages/server/src/lib/moderation.test.ts`:
   - clean text passes
   - CN slur detected
   - EN profanity whole-word
   - "assistant" doesn't trip "ass" word-boundary

2. `packages/server/src/api/reports.test.ts`:
   - POST /api/reports with valid body → 200 + row inserted
   - self-report → 400
   - >10/hour → 429
   - POST /api/reports/blocks → row inserted, idempotent
   - DELETE /api/reports/blocks/:id → row removed
   - GET /api/reports/blocks → returns list

Target: ≥12 new assertions across both files.

## Hard constraints

1. **DO NOT edit**:
   - `packages/server/src/db/schema.ts` (Stage 1)
   - `packages/server/src/engine/**` (Stage 2-B)
   - `packages/server/src/lib/auth.ts`, `lib/email.ts` (Stage 2-C)
   - `packages/server/src/socket/handlers.ts` EXCEPT the `chat:send` filter — read the file FIRST, if Stage 2-B has concurrent edits, make minimal-surgical change only to chat:send
   - `packages/server/src/index.ts`

2. **DO create**:
   - `packages/server/src/lib/moderation.ts`
   - `packages/server/src/lib/moderation.test.ts`
   - `packages/server/src/api/reports.ts`
   - `packages/server/src/api/reports.test.ts`
   - One UI component for the report/block flow

3. **Chat 过滤 is client-visible**: sender gets `chat:blocked` event. Other clients see nothing. Do NOT broadcast blocked messages.

4. **All UI strings via i18n** — zero hardcoded zh/en.

5. **No emoji**.

## Validation

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test
pnpm test
```

Manual:
1. Start a game, have two clients chat
2. Send "傻逼" → sender sees chat:blocked, other client sees nothing
3. Send a report via UI → check `/api/reports/blocks` or DB row
4. Block a user → future chat from them is filtered out client-side (note: server-side filtering of blocked users' messages is P1, client-side hide is enough for MVP)

## Deliverables

1. `lib/moderation.ts` with `moderateChat()` + banned word lists
2. `api/reports.ts` mounted at `/api/reports`
3. `socket/handlers.ts` chat:send pre-filter + `chat:blocked` emit
4. Minimal client UI: right-click or tap-hold chat message → Report / Block
5. i18n keys zh/en
6. Tests green (≥12 new assertions)
7. `docs/ISSUE_stage2-moderation.md`

## Out of scope (record, don't do)

- Admin moderation dashboard (triaging reports) — future
- Auto-ban after N reports — future (manual review for now)
- Server-side hiding of blocked users' messages across room — client-side hide is MVP
- Broad message sanitization (XSS, HTML) — chat is plain text, not rendered as HTML

START NOW.
