# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# STAGE 1: Foundation — schema + logger + middleware

You are the **foundation worker**. You prepare shared infrastructure that other workers (Stage 2 & 3) will build on. Your scope is narrow but critical: if you get this wrong, 6 other workers will be blocked.

## Context — what's happening

This is TableCraft, a board-game platform. We're adding production-readiness features in 3 stages via parallel Claude Code workers. You are Stage 1. After you finish, four parallel workers will start (persistence/AFK, email-reset, moderation, observability-wiring), then two more (reconnect/spectate, friends). Your job is to put **all new tables, the logger module, and middleware hooks** in place so they don't collide.

## Read FIRST (in this order)

1. `CLAUDE.md` — project guidelines (no emoji, no overengineering, surgical changes)
2. `packages/server/src/db/schema.ts` — current schema, extend at the bottom
3. `packages/server/drizzle/0003_ancient_elektra.sql` — latest migration to see the format
4. `packages/server/src/index.ts` — Express bootstrap (you'll add middleware)
5. `packages/server/package.json` — has `db:generate` script using drizzle-kit
6. `docs/DEVELOPMENT.md` if it exists — project conventions

## What to build (7 things)

### 1. Four new database tables in `packages/server/src/db/schema.ts`

Append to the bottom (do NOT edit existing tables). All `id` fields use `nanoid()` default like `actionLog`.

```ts
// ---------------------------------------------------------------------------
// Chat messages (persisted). GameRoom keeps a hot in-memory cache but
// messages are now durable across restarts.
// ---------------------------------------------------------------------------
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    roomId: text('room_id').notNull(),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index('idx_chat_room_created').on(t.roomId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// User reports (moderation). A reporter flags a target for a reason, with an
// optional roomId for game-context reports. Status tracks triage state.
// ---------------------------------------------------------------------------
export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    reporterId: text('reporter_id').notNull(),
    targetUserId: text('target_user_id').notNull(),
    roomId: text('room_id'),
    reason: text('reason').notNull(),   // 'harassment' | 'cheating' | 'spam' | 'other'
    detail: text('detail'),              // free-form user-provided text, max 500 chars
    status: text('status').notNull().default('pending'),  // 'pending' | 'reviewed' | 'actioned' | 'dismissed'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    targetIdx: index('idx_reports_target').on(t.targetUserId),
    statusIdx: index('idx_reports_status_created').on(t.status, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// User blocks (personal blocklist). blocker cannot see blocked user's chat
// and is auto-matched away from blocked users when matchmaking lands.
// ---------------------------------------------------------------------------
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id').notNull(),
    blockedId: text('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
    blockerIdx: index('idx_blocks_blocker').on(t.blockerId),
  }),
);

// ---------------------------------------------------------------------------
// Friendships. Undirected, but stored as a pair where userA < userB
// lexicographically (normalize at insert). `status`: 'pending' | 'accepted'
// where `requestedBy` indicates who sent the initial request.
// ---------------------------------------------------------------------------
export const friendships = pgTable(
  'friendships',
  {
    userA: text('user_a').notNull(),    // lexicographically smaller id
    userB: text('user_b').notNull(),    // lexicographically larger id
    requestedBy: text('requested_by').notNull(),  // either userA or userB
    status: text('status').notNull().default('pending'),  // 'pending' | 'accepted'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userA, t.userB] }),
    userAIdx: index('idx_friendships_user_a').on(t.userA),
    userBIdx: index('idx_friendships_user_b').on(t.userB),
    check: check(
      'friendships_normalized_check',
      sql`user_a < user_b`,
    ),
  }),
);
```

Make sure all imports (`sql`, `check`, `index`, `pgTable`, `primaryKey`, `text`, `timestamp`) are already at the top — they are. `nanoid` is too. No new imports needed.

### 2. Generate the migration

Run:
```bash
cd /Users/bytedance/Projects/boardgames
pnpm --filter @repo/server db:generate
```
This creates `packages/server/drizzle/0004_*.sql`. Review it — it should only CREATE TABLE for the 4 new tables, no drops or alters. Commit the generated SQL as-is.

### 3. Pino logger module at `packages/server/src/lib/logger.ts`

```ts
import pino from 'pino';

/**
 * Application logger. Pino in production (JSON), pretty in dev.
 *
 * Filters out pglite WASM noise at source by using a child logger with a
 * `mod` tag; pglite's stderr is not routed through this logger so nothing
 * to filter here, but the `mod` tag makes it easy to grep.
 *
 * Usage:
 *   import { logger } from './lib/logger';
 *   logger.info({ roomId }, 'room created');
 *   const log = logger.child({ mod: 'socket' });
 *   log.warn({ userId }, 'kicked');
 */
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: { service: 'tablecraft' },
});

export type Logger = typeof logger;
```

Install deps:
```bash
cd /Users/bytedance/Projects/boardgames
pnpm --filter @repo/server add pino
pnpm --filter @repo/server add -D pino-pretty
```

### 4. Helmet + express-rate-limit middleware in `packages/server/src/index.ts`

Install:
```bash
pnpm --filter @repo/server add helmet express-rate-limit
```

In `packages/server/src/index.ts`, find where `app = express()` and where `app.use(cors(...))` is. Add **right after cors**:

```ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// --- after app = express() and cors middleware ---

// Security headers. contentSecurityPolicy disabled because our SPA assets
// and Vite dev server don't align with the default CSP; we rely on origin
// checks for API and CORS for cross-origin.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// General API rate limit: 300 req/min per IP. Generous enough for real
// users (game actions bypass via socket.io), strict enough to stop obvious
// scrapers. Skip health check.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});
app.use('/api', apiLimiter);
```

Do NOT remove existing middleware. Do NOT touch route definitions.

### 5. Wire logger into `index.ts` bootstrap

At the very top of `packages/server/src/index.ts` (after existing imports), import the logger. Find the existing `console.log` lines for server startup (there are a few like `Server running on port ...`, `[shutdown]`, `[fatal]`) and replace **those specific lines** with `logger.info(...)` / `logger.fatal(...)`. Keep the existing `[db]` / `[shutdown]` / `[fatal]` prefix convention by passing them as objects: `logger.info({ mod: 'server' }, 'Server running on port 3001')`.

Do NOT chase every `console.log` in the whole codebase. Only `packages/server/src/index.ts`. Other files stay as-is for now.

### 6. Type-check everything

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
```

Must be green.

### 7. Run migration against the dev DB

The dev server auto-runs migrations on boot. Verify by:
1. Check `packages/server/src/db/index.ts` to confirm `migrate()` runs at startup.
2. Tests use a fresh in-memory DB each run, so `pnpm test` will exercise the new tables automatically via drizzle's migrate call.
3. Run `pnpm test` and ensure it stays green (we don't expect any new tests to pass yet — just no regressions).

## Hard constraints

1. **DO NOT touch these files** (other workers own them, would conflict):
   - `packages/server/src/engine/GameRoom.ts`
   - `packages/server/src/engine/RoomManager.ts`
   - `packages/server/src/socket/handlers.ts`
   - `packages/server/src/api/router.ts` beyond very tiny hooks if needed (if you think you need to, DON'T — record it in ISSUE doc instead)
   - `packages/server/src/lib/auth.ts`
   - Any files under `packages/client/` (client-side telemetry is Stage 2's job)

2. **DO NOT create new route files** (e.g. `api/reports.ts`, `api/friends.ts`). Other workers will create these on top of your schema.

3. **DO NOT add any business logic**. You create tables, logger, and middleware — nothing else.

4. **No emoji anywhere** (project rule from CLAUDE.md).

5. **No hardcoded strings that face users**. The error strings in rate-limit's default responses are OK (not yet i18n'd — noted as follow-up).

## Validation

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Type-check
pnpm typecheck

# 2. Full test suite
pnpm test

# 3. Schema sanity — confirm 4 new tables referenced
grep -E "chatMessages|reports|userBlocks|friendships" packages/server/src/db/schema.ts

# 4. Migration file exists
ls packages/server/drizzle/0004_*.sql

# 5. Dev server boots (check health endpoint)
curl -s http://localhost:3001/api/health
# — if dev server is restarting because of your changes, wait for it
```

All 5 checks pass = you're done.

## Deliverables

1. 4 new tables in `schema.ts` (appended, no edits to existing)
2. `packages/server/drizzle/0004_*.sql` generated migration
3. `packages/server/src/lib/logger.ts` pino logger
4. `packages/server/src/index.ts` uses `helmet`, `rateLimit('/api')`, and logger for server-lifecycle logs
5. `packages/server/package.json` has pino, pino-pretty, helmet, express-rate-limit deps
6. `pnpm typecheck` + `pnpm test` green
7. `docs/ISSUE_stage1-foundation.md` with the standard 6-section template

## If you find a bug in shared infrastructure

DO NOT fix it in places outside your scope. Record it in `docs/ISSUE_stage1-foundation.md`. The orchestrator will triage.

## Out of scope (record in ISSUE doc if you're tempted)

- Migrating existing `console.log` calls beyond `index.ts`
- Adding logger to engine/socket layers (that's downstream workers' choice)
- CSP policy tuning
- Rate-limit per-route customization
- Sentry/PostHog integration (Stage 2 observability worker handles that)
- Email transport (Stage 2 email worker handles that)

START NOW. Read the files listed above, implement, test, write ISSUE doc.
