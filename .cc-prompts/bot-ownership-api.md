# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped backend implementation task with complete spec below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# Parallel-worker note

You are running in parallel with OTHER workers editing DIFFERENT files in this project. Another worker (frontend) will edit `packages/client/src/**` — do not touch client code. Another worker edits `~/.hermes/skills/**` — not under this repo. If you see uncommitted changes in files you did not touch, LEAVE THEM ALONE. Never `git stash` / `git reset` / `git checkout`. Your scope is ONLY the paths listed in §Scope below.

# Task

Make bot accounts first-class ranking citizens on TableCraft. Today bots are skipped in the points ledger (`GameRoom.ts:546 — if (info.isBot) continue;`), so they never appear on the leaderboard even after winning games. We want:

1. Bots CAN earn points and appear on the `/api/leaderboard` (alongside human users, marked as bots).
2. Every bot token is **owned by a logged-in BetterAuth user** (≤5 bots per user). Bot identity is tied to its owner for accountability and display.
3. A CLI-friendly HTTP API lets a logged-in user CRUD their bots: `list`, `create`, `revoke`. Admin-only `POST /api/admin/bots` legacy flow is fine to keep working for backward compat but is no longer the primary path.
4. Leaderboard entries for bots are labeled (so the UI can show a "🤖" badge). The bot row also carries its owner's display name.

## Background (read these files in order BEFORE editing)

1. `/Users/bytedance/Projects/boardgames/packages/server/src/db/schema.ts` — full schema. Note `users` (legacy, plural), `user` (BetterAuth, singular), `botTokens`, `pointsLedger`.
2. `/Users/bytedance/Projects/boardgames/packages/server/src/api/token-store.ts` — current bot token CRUD.
3. `/Users/bytedance/Projects/boardgames/packages/server/src/api/auth.ts` — bot Bearer auth middleware.
4. `/Users/bytedance/Projects/boardgames/packages/server/src/api/router.ts` — bot API surface, room/game routes.
5. `/Users/bytedance/Projects/boardgames/packages/server/src/api/points.ts` — leaderboard + /me endpoints.
6. `/Users/bytedance/Projects/boardgames/packages/server/src/lib/ledger.ts` — `recordPoints`.
7. `/Users/bytedance/Projects/boardgames/packages/server/src/engine/GameRoom.ts` (read lines 530-570 especially — `writePointsLedger`).
8. `/Users/bytedance/Projects/boardgames/packages/server/src/api/points.test.ts` — existing leaderboard test patterns.
9. `/Users/bytedance/Projects/boardgames/packages/server/src/api/token-store.test.ts`
10. `/Users/bytedance/Projects/boardgames/packages/server/src/api/friends.test.ts` — for the BetterAuth-session test pattern (how tests mock / set up a signed-in user).
11. `/Users/bytedance/Projects/boardgames/packages/server/src/index.ts` — find where routes are wired.
12. `/Users/bytedance/Projects/boardgames/packages/server/drizzle/` (migrations dir — or look for migrate script). Check how migrations are added.

Key existing facts (verified by orchestrator):

- Bot `userId` format: `bot_<nanoid>`.
- `pointsLedger.userId` is a FK to `user.id` (BetterAuth table) with `onDelete: 'set null'`. This means today, even if we removed the `if (info.isBot) continue` line, bots would write `userId: 'bot_xxx'` into `pointsLedger` but there is no matching row in `user` so the insert would SUCCEED (the FK has `set null` on DELETE, not on INSERT — you can insert a userId that doesn't exist in `user`? Actually postgres WILL fail on INSERT with a missing FK target unless the FK is deferrable). VERIFY THIS before deciding the insert strategy. If the insert fails: we need a different ledger-owner column OR we need to shadow-insert a `user` row for each bot. If it succeeds (pglite quirk?) we need the leaderboard join in `points.ts:257` not to drop bot rows.
- Leaderboard query (`points.ts:239-259`) inner-joins `pointsLedger` on `user` — this **silently drops bot rows** because no user row exists for `bot_xxx` ids.
- `botTokens` has NO `ownerUserId` column today — all bots are unowned.

## Scope (files you may edit)

### Schema + migration
- `packages/server/src/db/schema.ts`
- `packages/server/drizzle/**` — ADD a new migration file. Keep existing ones.
- `packages/server/scripts/migrate-dev.ts` or similar — do NOT edit, just invoke.

### Server code
- `packages/server/src/api/token-store.ts` — extend with ownership & limit
- `packages/server/src/api/bots.ts` — NEW FILE: HTTP router for `/api/me/bots` (session-authed CRUD)
- `packages/server/src/api/points.ts` — leaderboard query needs to include bots + mark them
- `packages/server/src/engine/GameRoom.ts` — stop skipping bots in `writePointsLedger`
- `packages/server/src/index.ts` — wire the new `/api/me/bots` router
- `packages/server/src/api/router.ts` — possibly expose a read path from leaderboard for bots

### Shared types
- `packages/shared/src/types/points.ts` or wherever leaderboard types live — add `isBot` + `ownerName` fields to the leaderboard entry type. If no existing shared types for this, find and extend the narrowest file. The frontend worker (parallel) WILL rely on this contract, so get it right.

### Tests (ADD, don't replace)
- `packages/server/src/api/bots.test.ts` — NEW. Test CRUD + ownership limit + auth.
- Extend `packages/server/src/api/points.test.ts` — bot winners appear in leaderboard with `isBot:true` and ownerName.
- Extend `packages/server/src/engine/GameRoom.ledger.test.ts` — bot players now get ledger rows.

### Do NOT edit
- ANY `packages/client/**` file (parallel frontend worker's scope).
- ANY `~/.hermes/**` file (skill-doc worker's scope).
- Any `games/**` game implementation.

## Specification

### Schema migration

Add a new column and an optional shadow-user strategy. **Pick ONE of two designs** (you decide after reading the code; document your choice in the ISSUE doc):

**Design A (preferred if it works): bot_tokens gets `owner_user_id`, ledger writes `bot_` ids directly, leaderboard query unions or LEFT JOINs to include them.**

```sql
ALTER TABLE bot_tokens ADD COLUMN owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
CREATE INDEX idx_bot_tokens_owner ON bot_tokens(owner_user_id);
-- No constraint on NULL for now (existing bot tokens predate ownership); backfill strategy below.
```

Change `pointsLedger.userId` FK behavior: CURRENTLY it references `user.id`. Bot ids will NOT exist in `user`. Options:

- **A1**: Drop the FK on `points_ledger.user_id` → TEXT without FK. Application enforces validity. Simplest. Do this.
- **A2**: Add a new column `bot_id` to points_ledger with a FK to `bot_tokens.user_id` (which is unique). CHECK: exactly one of `user_id` / `bot_id` / `guest_id` is non-null. More rigorous but more migration work.

Go with **A1** for this iteration (note it in ISSUE doc as a future hardening target).

**Design B (fallback): create a shadow row in `user` for every bot, with `email` like `bot+<userId>@tablecraft.internal`, `emailVerified=false`, `name` = bot name.** Cleaner FK story but polutes the human user table and complicates the BetterAuth assumptions. Reject unless A1 proves infeasible.

Migration file naming: follow whatever drizzle-kit convention is in use. Check existing migrations first (`ls packages/server/drizzle/`). If drizzle-kit is set up, use `pnpm --filter @repo/server exec drizzle-kit generate` after editing `schema.ts`; otherwise hand-write the SQL migration in the existing style.

**Backfill**: existing unowned bot tokens (e.g. `DefaultBot` seeded in dev) keep `owner_user_id: NULL`. The API spec below explicitly allows them to keep working (read-only for the owner CRUD endpoint; they just can't be listed under any specific user). Do NOT delete them.

### `token-store.ts` extensions

Add to `TokenStore`:

```ts
listByOwner(ownerUserId: string): Promise<BotRow[]>
generateOwned(ownerUserId: string, name: string): Promise<{ token: string; userId: string }>  // enforces 5-cap
revokeOwned(ownerUserId: string, botUserId: string): Promise<boolean>  // only if caller owns it
getOwnerId(botUserId: string): Promise<string | null>  // for future use
```

Where `BotRow` is `{ userId: string; name: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }` — never leak `tokenHash`.

`generateOwned` must:
1. Count existing non-revoked bots for owner. If ≥ 5, throw `BotLimitError` (or return a sentinel — either is fine, pick one; document in code).
2. Otherwise generate as today (nanoid token), but also set `ownerUserId`.

Cap is **5 non-revoked bots per owner**. Revoked bots don't count toward the cap.

### New router `packages/server/src/api/bots.ts`

Session-authenticated (BetterAuth session, same pattern as `api/points.ts` /me routes). Error shape matches `api/points.ts`: `{ ok: false, error: { code, message } }` with 401/403/409/429.

```
GET  /api/me/bots
  200 { ok: true, data: { bots: BotRow[], remaining: number } }
     where remaining = 5 - non-revoked.length
  401 UNAUTHORIZED

POST /api/me/bots
  body: { name: string (1..40 chars) }
  201 { ok: true, data: { bot: BotRow, token: string } }   // token shown ONCE
  400 INVALID_BODY (missing/too-long name)
  401 UNAUTHORIZED
  409 BOT_LIMIT_REACHED (already have 5)

DELETE /api/me/bots/:botUserId
  200 { ok: true, data: { revoked: true } }
  401 UNAUTHORIZED
  403 NOT_OWNER (bot exists but isn't caller's)
  404 NOT_FOUND
```

Rate limit: use the same `rateLimit` middleware used elsewhere if present; otherwise leave a `// TODO: rate limit` comment and skip. Don't block on this.

### `GameRoom.writePointsLedger` changes

Change line 546:

```ts
// OLD
if (info.isBot) continue;

// NEW
// Bots are first-class: they earn points and appear on leaderboard.
// Ownership tracking lives in bot_tokens; ledger writes the bot's userId
// directly into points_ledger.user_id (the FK constraint is application-
// enforced since 2026-05 — see migration xxx).
const isGuest = info.isGuest ?? true;
```

Actually — more carefully: read the current block lines 540-557. The existing logic picks `userId: isGuest ? null : pid` and `guestId: isGuest ? pid : null`. For bots, `isGuest === false` (see how `join()` is called for bots in `router.ts` — it passes `isBot=true, isGuest=false`). So simply removing the `if (info.isBot) continue;` line achieves the right thing — bot pid goes into `userId`. Verify this by reading the `join()` calls and confirming. If bot calls pass `isGuest=true`, you'll need to handle that explicitly.

Add a code comment where the old `continue` was explaining why bots now participate.

### `points.ts` leaderboard query

The current inner-join to `user` silently drops bot rows because bot ids don't exist in `user`. Fix by changing the JOIN to a LEFT JOIN and supplementing with a join to `bot_tokens`:

```ts
// Pseudo:
select userId, total, coalesce(user.name, bot.name, userId) as name,
       (bot.userId is not null) as isBot,
       owner.name as ownerName -- bot's owner if any
from pointsSubquery
left join user on user.id = pointsSubquery.userId
left join bot_tokens bot on bot.userId = pointsSubquery.userId
left join user owner on owner.id = bot.owner_user_id
order by total desc
limit ...
```

Return entries:

```ts
interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  isBot: boolean;         // NEW
  ownerName: string | null; // NEW: bot's owner display name, null for humans or unowned bots
}
```

Also update `GET /api/leaderboard/me` — a bot's owner calling `/me` with their session sees THEIR own rank, not their bots'. That's the existing behavior and doesn't change. But if a bot *happens* to be caller's identity (won't happen via session auth — bots don't have sessions — but just in case) return the rank correctly. This is a free no-op.

Update `/api/me` (user profile endpoint) to ALSO return the list of bots the user owns in a new `bots: BotRow[]` field — wire this by calling into TokenStore from the `/api/me` handler. This gives the frontend the data it needs for the profile page in one round-trip.

### Shared type updates

Find where `LeaderboardEntry` is currently typed (grep: `rank.*userId.*name.*points`). Add `isBot: boolean` and `ownerName: string | null`. If it lives in `packages/shared/src/types/`, export it properly. If it's inlined in the client, COPY it to shared and re-import. The parallel frontend worker will need to read this file to know the contract.

If the leaderboard entry type is currently inlined into `packages/client/src/pages/Leaderboard.tsx` and NOT in shared — DO NOT touch client code. Instead, create the type in `packages/shared/src/types/leaderboard.ts`, export it, and tell the frontend worker (via ISSUE doc) to switch the import. They'll do the client-side swap.

### Tests

Use the existing test pattern from `packages/server/src/api/friends.test.ts` and `points.test.ts`:

- Spin up a test DB (pglite)
- Seed BetterAuth user rows directly via `db.insert(user).values(...)` with a fixed id
- Mock a session the same way other tests do

Required specs:

**`bots.test.ts`**:
- `GET /api/me/bots` without session → 401
- Signed-in user with zero bots → `{ bots: [], remaining: 5 }`
- Create bot → `{ bot: { userId: 'bot_...', name: 'My Bot' }, token: '...' }`; returned token is non-empty and at least 20 chars
- Create 5 bots, 6th → 409 BOT_LIMIT_REACHED
- Revoke one of 5 → remaining becomes 1
- User A cannot revoke User B's bot → 403 NOT_OWNER
- Listing excludes revoked bots by default (or includes with `revoked: true`; pick one and document — prefer: revoked bots are HIDDEN in the default list but counted separately if needed; remaining field is based on non-revoked count)

**`points.test.ts` extension**:
- Seed: user Alice (real user) + bot B1 owned by Alice + bot B2 owned by Bob + unowned bot U.
- Write ledger rows: Alice +20, B1 +10, B2 +5, U +3
- `GET /api/leaderboard` returns all 4 entries, ordered by points desc. B1 has `isBot:true, ownerName:'Alice'`. B2 has `isBot:true, ownerName:'Bob'`. U has `isBot:true, ownerName:null`. Alice has `isBot:false, ownerName:null`.

**`GameRoom.ledger.test.ts` extension**:
- Seed a room with 1 human + 1 bot, play to completion where the bot wins.
- Assert `pointsLedger` has TWO rows: one for human (reason loss/win), one for bot (reason win).
- Verify the bot's row has `userId = bot_xxx` (not guestId).

## Iron rules (all apply)

1. **i18n strict** — all user-facing strings go through `t(key)`. Zero hardcoded Chinese/English in .tsx/.ts. Every new error `message` here is API-side so it goes in English and is surfaced via error `code` — the frontend will translate. That's fine. But do not add any UI strings at all (you're not editing client code).
2. **Typecheck is truth** — `pnpm typecheck` end-to-end must be green before you report done.
3. **Don't touch other workers' files** — see §Scope above.
4. **Migration naming** — follow the convention already in the drizzle folder. If you're not sure, look at the 2-3 most recent migrations first.
5. **Server authorization is source of truth** — every DELETE must re-verify ownership even if the client passed an id. Don't trust request body alone.
6. **Don't break existing bot flow** — `DefaultBot` seeded in `index.ts` must still authenticate via Bearer token. The admin-token creation path (if exists) stays. Existing CLI flows (`tablecraft login --token ...`) keep working unchanged.
7. **Don't commit, don't push, don't start dev server** — orchestrator handles those. Just write code + migrations + run tests.

## Validation (run these, PASTE OUTPUT into the ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/server typecheck

# 2. Generate + apply migrations if using drizzle-kit (otherwise skip)
pnpm --filter @repo/server exec drizzle-kit generate || true
# Run dev migration
pnpm --filter @repo/server exec tsx scripts/migrate-dev.ts || true

# 3. Test
pnpm --filter @repo/server test

# 4. Full suite
pnpm typecheck
pnpm test
```

Paste **exact stdout/stderr** of each into the ISSUE doc. If anything fails, fix it — do NOT ship red.

## Deliverable

Write `docs/ISSUE_bot-ownership.md` with these sections:

1. **Design decision**: A1 (FK drop) or A2 (separate bot_id column) — which you picked and why.
2. **Migration details**: file path, SQL diff.
3. **API contract**: final endpoint + request/response shapes (for frontend worker + CLI worker to consume).
4. **Tests added**: file-by-file count + most interesting assertions.
5. **Validation output**: full paste of the 4 commands above.
6. **Bugs found during testing**: anything unexpected.
7. **Design choices where spec was silent**: e.g. revoked list visibility, name field max length, what happens to bot's past ledger rows on user deletion.
8. **Deferred / future work**: A2, rate limits, admin UI, bot-count display on leaderboard header.
9. **Known frontend touchpoints** (so the parallel frontend worker knows what to consume):
   - New endpoints: `GET/POST/DELETE /api/me/bots`, `/api/me` now also returns `bots`.
   - LeaderboardEntry has new `isBot`, `ownerName` fields (shared type location: `<path>`).
   - Existing i18n keys still apply; no new keys from server side.

START NOW.
