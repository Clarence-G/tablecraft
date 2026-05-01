# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# E2E Stage 2b worker: Social + Leaderboard specs

You are an E2E-spec worker on TableCraft. Your job: write 3 Playwright specs
covering social features (friends) and leaderboard. You import helpers from
Stage 1 infrastructure (`tests/e2e/helpers/*`).

Another worker (Stage 2a) is running in parallel on auth/rooms/smoke specs.
You must not touch anything outside your declared scope.

## Read these Stage 1 artifacts FIRST

- `tests/e2e/README.md` — Stage 1 usage guide (read completely)
- `docs/ISSUE_e2e-stage1-infra.md` — known infra gaps, prompt clarity fixes
- `tests/e2e/helpers/identity.ts`, `auth.ts`, `rooms.ts`, `bots.ts`
- `tests/e2e/fixtures/db-reset.ts`, `server-log.ts`

Also skim the relevant production code:
- `packages/client/src/hooks/useFriends.ts` — friends API client
- `packages/client/src/components/layout/LobbySidePanel.tsx` — FriendsTab UI (IMPORTANT: you can read it, you cannot modify it)
- `packages/server/src/api/friends.ts` — server friends endpoints
- `packages/server/src/api/points.ts` — leaderboard endpoints
- `packages/client/src/pages/Leaderboard.tsx` — full leaderboard page (for the /leaderboard route test)

## TableCraft iron rules (ALL apply)

1. **i18n strict**: prefer `data-testid` and role-based selectors. When text
   must be used, read from the locale file (see `helpers/rooms.ts` for the
   `import zh from '.../common.json'` pattern).

2. **App.tsx URL-sync guard**: you are not adding routes. Use existing routes:
   `/`, `/login`, `/register`, `/leaderboard`, `/me`.

3. **`authClient` path**: `@/lib/authClient` (verified in Stage 1). API surface:
   `authClient.signUp.email`, `authClient.signIn.email`, `authClient.signOut`,
   `authClient.requestPasswordReset`, `authClient.resetPassword`,
   `authClient.getSession`.

4. **Server authorization is source of truth**: friends features are
   authenticated endpoints. Guest users cannot access them — this is a
   negative scenario to test.

5. **Typecheck is truth**: `pnpm typecheck` end-to-end.

6. **i18n parity is non-negotiable**: if you need to add any locale keys,
   both zh and en must match.

7. **Don't touch other workers' files**: Worker 2a owns auth/rooms/smoke.
   You own social/leaderboard.

## Scope fence (YOUR editable paths)

Editable:
- `tests/e2e/specs/social/**` (new dir)
- `tests/e2e/specs/leaderboard/**` (new dir)
- `docs/ISSUE_e2e-stage2b-social-leaderboard.md` — new ISSUE doc

Adding `data-testid` to production code — ALLOWED but LIMITED SCOPE:
- `packages/client/src/pages/Leaderboard.tsx` — add `data-testid="leaderboard-page"` on the root div, and `data-testid="leaderboard-row"` on each row item

If the file you need is elsewhere, document in ISSUE doc and use a text
fallback via locale imports.

FORBIDDEN paths (Worker 2a owns these OR outside feature):
- `tests/e2e/specs/auth/**`
- `tests/e2e/specs/rooms/**`
- `tests/e2e/specs/smoke/**`
- `tests/e2e/gomoku.spec.ts`, `leave-room.spec.ts` — worker 2a migrates
- `tests/e2e/helpers/**` — Stage 1 output, immutable
- `packages/client/src/pages/Lobby.tsx`, `LobbySidePanel.tsx`, `RoomsAll.tsx`
- `packages/server/src/**` (all server code)
- `games/**`

Testids: only the 2 specific leaderboard testids listed above.

## What to write (3 specs)

### C. Social specs (2 files)

#### `tests/e2e/specs/social/friend-request-flow.spec.ts`
- Alice registers as email user → signs in
- Bob registers as email user → signs in (separate browser context)
- Alice opens friends tab → searches for Bob by name/email
- Alice sends a friend request to Bob
- Bob's friends tab shows incoming request
- Bob accepts
- Both see each other in friends list
- Alice removes Bob → both see empty friends list

**Key assertions:**
- After accept: both sides' friends list shows the counterpart (requires reload or realtime update — verify which)
- After remove: symmetry preserved (both sides updated)

#### `tests/e2e/specs/social/friend-request-rejection.spec.ts`
- Alice sends Bob a friend request
- Bob **declines** / **blocks** (whichever UI supports — check LobbySidePanel.tsx)
- Alice tries to re-send → either:
  - UI-side cooldown prevents the button from working, OR
  - Server rejects (`POST /api/friends/request` returns 409 or similar)
- Assert the behavior that actually occurs; if neither cooldown nor rejection
  exists, document as a bug in ISSUE doc

**Negative scenarios:**
- Guest user (no login) opens friends tab → sees guest-empty-state with
  "Sign In" CTA, does NOT see actual friend search UI
- Unauthenticated API call: `curl /api/friends/request` without session cookie
  → 401

### D. Leaderboard spec (1 file)

#### `tests/e2e/specs/leaderboard/period-switching.spec.ts`
- Setup: create 3 email users via helpers (Alice, Bob, Charlie)
- Use bots (from `helpers/bots.ts`) to simulate 3+ game completions between
  them, OR use a direct points ledger seed (check `packages/server/src/lib/ledger.ts`
  for a helper if one exists; if not, use the CLI/socket to actually play)
- Navigate to `/leaderboard` → see all-time ranking
- Switch to "本周" / weekly → ranking updates (different set or same set with
  reset counts)
- Switch to "今日" / daily → ranking updates
- Assert: counts visible, no crashes, pagination or empty-state works

**Negative scenarios:**
- Invalid period param: `GET /api/leaderboard?period=invalid` falls back to
  `all` (server's existing contract per Stage 3 implementation)
- Unauthenticated access: leaderboard is PUBLIC — anyone should see it without
  login (confirm this is true in a test, NOT a negative assertion)

**Alternative if seeding is too hard:**
If seeding 3 completed games programmatically is painful, you may reduce
this spec to: "navigate → leaderboard renders → period toggle works → rows
present (count > 0 from seed data already in DB)". Document what you did.

## NEGATIVE-SCENARIO acceptance (mandatory)

Every "user cannot X" or "server rejects X" in the spec must have an
explicit test. Examples:

```ts
test('guest cannot send friend request', async ({ page }) => {
  await seedGuestIdentity(page, { userName: 'Guest' });
  await page.goto('/');
  const resp = await page.request.post('/api/friends/request', { ... });
  expect(resp.status()).toBe(401);
});
```

## Validation (mandatory, paste output in ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Typecheck
pnpm typecheck

# 2. Unit test regression
pnpm test

# 3. E2E — run ONLY your specs first to validate (faster than full suite)
pnpm test:e2e tests/e2e/specs/social tests/e2e/specs/leaderboard --reporter=list

# 4. Then run the full suite to confirm you didn't break worker 2a
pnpm test:e2e --reporter=list

# 5. i18n parity
node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json');const e=require('./packages/client/src/i18n/locales/en/common.json');const flat=(o,p='')=>{const r=[];for(const k in o){if(typeof o[k]==='object'&&!Array.isArray(o[k]))r.push(...flat(o[k],p+k+'.'));else r.push(p+k)}return r};console.log('zh only:',[...new Set(flat(z))].filter(x=>!new Set(flat(e)).has(x)));console.log('en only:',[...new Set(flat(e))].filter(x=>!new Set(flat(z)).has(x)));"

# 6. Hardcoded Chinese sweep
rg '[\u4e00-\u9fff]+' tests/e2e/specs/social tests/e2e/specs/leaderboard --glob '*.spec.ts' | head -40

# 7. Scope audit
git status --short
git diff --stat
```

## Deliverables

1. 3 new spec files
2. `pnpm typecheck` green
3. `pnpm test` green (no regression)
4. **`pnpm test:e2e` — all specs pass** (gate)
5. `docs/ISSUE_e2e-stage2b-social-leaderboard.md` with 6 sections

## If you find a real bug

DO NOT fix it. Record in ISSUE doc, write `test.fixme(...)` if it blocks.

## Out of scope

- Worker 2a's specs
- Modifying production friends/leaderboard code
- Adding cooldown logic if missing
- CI

START NOW. Read Stage 1 artifacts and the relevant production code (friends.ts,
points.ts, LobbySidePanel.tsx), then write specs. Validate incrementally.
