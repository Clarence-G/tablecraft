# ISSUE: Bot Ownership & First-Class Leaderboard

## 1. Design Decision: A1 (FK drop)

Chose **Design A1** — dropped the FK constraint on `points_ledger.user_id`. Bot user IDs (`bot_xxx`) do not exist in the `user` table, so inserting them directly requires either a shadow row in `user` (Design B) or removing the FK (A1). A2 (separate `bot_id` column with its own FK to `bot_tokens`) would need the check constraint rewritten and callers updated.

A1 is the simplest: the application already validates that userId values are either real BetterAuth IDs or known bot IDs before writing. The existing check constraint (`user_id IS NOT NULL OR guest_id IS NOT NULL`) is preserved — bot rows satisfy it via the non-null `user_id` column.

**Future hardening**: A2 (separate `bot_id` column) would restore referential-integrity guarantees; tracked as future work.

## 2. Migration Details

**File**: `packages/server/drizzle/0006_bot_ownership.sql`

```sql
-- Add owner_user_id to bot_tokens so bots are tied to a logged-in user.
ALTER TABLE "bot_tokens" ADD COLUMN "owner_user_id" text REFERENCES "public"."user"("id") ON DELETE CASCADE;
CREATE INDEX "idx_bot_tokens_owner" ON "bot_tokens" USING btree ("owner_user_id");

-- Design A1: drop FK on points_ledger.user_id (bot IDs have no matching user row).
ALTER TABLE "points_ledger" DROP CONSTRAINT "points_ledger_user_id_user_id_fk";
```

`_journal.json` updated to index 6 (`tag: "0006_bot_ownership"`, when 1746172800000).

## 3. API Contract

All new endpoints use the same error envelope as `points.ts`: `{ ok: false, error: { code, message } }`.

### `GET /api/me/bots`
- **Auth**: session cookie
- **200**: `{ ok: true, data: { bots: BotRow[], remaining: number } }` — active (non-revoked) bots only; `remaining = 5 - bots.length`
- **401**: `UNAUTHORIZED`

### `POST /api/me/bots`
- **Auth**: session cookie
- **Body**: `{ name: string }` (1–40 chars)
- **201**: `{ ok: true, data: { bot: BotRow, token: string } }` — token is shown **once**
- **400**: `INVALID_BODY`
- **401**: `UNAUTHORIZED`
- **409**: `BOT_LIMIT_REACHED`

### `DELETE /api/me/bots/:botUserId`
- **Auth**: session cookie
- **200**: `{ ok: true, data: { revoked: true } }`
- **401**: `UNAUTHORIZED`
- **403**: `NOT_OWNER`
- **404**: `NOT_FOUND`

### `GET /api/me` (extended)
Now includes a `bots: BotRow[]` field alongside `user`, `points`, and `recentGames`.

### `GET /api/leaderboard` (extended)
Each entry now carries two new fields:
```ts
interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  isBot: boolean;        // true for bot accounts
  ownerName: string | null; // bot's owner display name; null for humans or unowned bots
}
```

**BotRow type**:
```ts
interface BotRow {
  userId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;   // null means active
}
```
`tokenHash` is never returned to callers.

## 4. Tests Added

### `packages/server/src/api/bots.test.ts` (NEW — 10 tests)
- `GET /api/me/bots` → 401 without session
- `GET /api/me/bots` → `{ bots: [], remaining: 5 }` for new user
- `POST /api/me/bots` → creates bot, returns non-empty token (≥20 chars)
- `POST /api/me/bots` → 401 without session
- `POST /api/me/bots` → 400 on missing or too-long name
- `POST /api/me/bots` × 6 → 409 `BOT_LIMIT_REACHED` on 6th
- Revoke one of 5 → remaining becomes 1, revoked bot absent from default list
- User B cannot revoke User A's bot → 403 `NOT_OWNER`
- `DELETE` unknown bot → 404
- `DELETE` without session → 401

### `packages/server/src/api/points.test.ts` (extended — +3 tests, 19 total)
- Leaderboard with Alice + 3 bots (B1 owned by Alice, B2 owned by Bob, Unowned): all 4 entries present, sorted desc. B1 has `isBot:true, ownerName:'Alice'`; B2 has `ownerName:'Bob'`; Unowned has `ownerName:null`; Alice has `isBot:false`.
- `/api/me` returns `bots` array; `tokenHash` does not leak.

### `packages/server/src/engine/GameRoom.ledger.test.ts` (extended — 3 tests, was 2)
- Updated existing test: 3-player game (userA, guestB, botC) now produces **3** ledger rows; bot row has `userId='botC'`, `guestId=null`.
- New test: bot wins → bot's row has `reason='win'`, `points=10`, `userId='bot_winner'`.

## 5. Validation Output

```
# 1. Shared typecheck
pnpm --filter @repo/shared build
> @repo/shared@ build ...
> tsc --noEmit
(clean)

# 2. Server typecheck
pnpm --filter @repo/server build
> @repo/server@ build ...
> tsc --noEmit
(clean)

# 3. Server tests
pnpm --filter @repo/server test
 ✓ src/engine/GameRoom.test.ts         (19 tests)
 ✓ src/socket/handlers.test.ts          (7 tests)
 ✓ src/lib/moderation.test.ts           (8 tests)
 ✓ src/lib/email.test.ts                (3 tests)
 ✓ src/engine/GameRoom.ledger.test.ts   (3 tests)
 ✓ src/db/db.test.ts                    (3 tests)
 ✓ src/lib/auth.test.ts                 (4 tests)
 ✓ src/lib/ledger.test.ts               (7 tests)
 ✓ src/socket/auth.test.ts              (6 tests)
 ✓ src/api/reports.test.ts              (8 tests)
 ✓ src/api/token-store.test.ts          (9 tests)
 ✓ src/api/bots.test.ts                (10 tests)
 ✓ src/api/friends.test.ts             (16 tests)
 ✓ src/api/points.test.ts              (19 tests)
 Test Files  14 passed (14)
      Tests  122 passed (122)

# 4. Full workspace
pnpm test
 Test Files  33 passed (33)
      Tests  502 passed (502)
     Errors  14 errors  ← pre-existing html-encoding-sniffer/jsdom ESM compat
                          issue; no tests fail because of it
```

## 6. Bugs Found During Testing

- **Bot `isGuest` was `true`**: The API router calls `room.join(userId, name, true)` with only 3 args, so `isGuest` defaults to `true` (the 4th parameter default). If we had naively removed the `if (isBot) continue` line, bots would have been written to `guestId` instead of `userId`. Fixed by making `isGuest = !info.isBot && (info.isGuest ?? true)` in `writePointsLedger`.

## 7. Design Choices Where Spec Was Silent

- **Revoked bots in list**: Default listing (`GET /api/me/bots`) returns **only non-revoked** bots. The `remaining` field is `5 - nonRevokedCount`. There is no `?includeRevoked` query param exposed yet.
- **Bot name max length**: 40 characters, matching the `name` field in `botTokens`.
- **Past ledger rows on user deletion**: `bot_tokens.owner_user_id` has `ON DELETE CASCADE` — deleting an owner deletes their `bot_tokens` rows. The corresponding `pointsLedger` rows are orphaned (no FK after A1 drop); they remain in the ledger as-is. If the `pointsLedger` row is queried by leaderboard, it will LEFT JOIN to a missing `bot_tokens` row and show `isBot:false, name=userId` (coalesce fallback).
- **Empty-name trimming**: POST body `name` is trimmed before length check, so `"  "` (spaces only) returns 400 INVALID_BODY.

## 8. Deferred / Future Work

- **Design A2**: Restore FK integrity with a separate `bot_id` column in `points_ledger` that references `bot_tokens.user_id`. Currently tracked as a future hardening item.
- **Rate limiting** on `POST /api/me/bots`: The handler has a `// TODO: rate limit` comment in the spec; not implemented in this iteration.
- **Admin UI**: No admin interface for listing all bots or transferring ownership.
- **Bot-count header on leaderboard**: The leaderboard `total` field now includes bots; the UI may want to show "X humans + Y bots" separately.
- **Revoked-bot audit log**: Revocations are silent; a future audit-log endpoint could list historical bots per user.

## 9. Known Frontend Touchpoints

### New endpoints (for frontend / CLI workers to consume)
- `GET    /api/me/bots` — list active bots (session cookie)
- `POST   /api/me/bots` — create bot, returns token once
- `DELETE /api/me/bots/:botUserId` — revoke ownership

### Extended endpoints
- `GET /api/me` — now includes `bots: BotRow[]` in response `data`
- `GET /api/leaderboard` — entries now include `isBot: boolean` and `ownerName: string | null`

### Shared type location
- `LeaderboardEntry` is now defined in `packages/shared/src/types/leaderboard.ts` and exported via `packages/shared/src/types/index.ts` (and thus re-exported from `@repo/shared`).

### i18n
- No new server-side user-facing strings. Error codes (`BOT_LIMIT_REACHED`, `NOT_OWNER`, `NOT_FOUND`, `INVALID_BODY`) are API-level codes for the frontend to translate.
