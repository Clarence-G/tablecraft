# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# E2E Stage 2a worker: Auth + Rooms + Smoke specs

You are an E2E-spec worker on TableCraft. Your job: write 8 Playwright specs
covering auth flows, room lifecycle, and a cross-game smoke test. You import
helpers from the Stage 1 infrastructure (`tests/e2e/helpers/*`). You also
migrate the 2 existing legacy specs (`gomoku.spec.ts`, `leave-room.spec.ts`)
to use the new helpers.

Another worker (Stage 2b) is running in parallel on social/leaderboard specs.
You must not touch anything outside your declared scope.

## Read these Stage 1 artifacts FIRST

- `tests/e2e/README.md` — Stage 1 usage guide (read completely)
- `docs/ISSUE_e2e-stage1-infra.md` — known infra gaps, prompt clarity fixes, wrong testids
- `tests/e2e/helpers/identity.ts`, `auth.ts`, `rooms.ts`, `bots.ts`
- `tests/e2e/fixtures/db-reset.ts`, `server-log.ts`
- `tests/e2e/helpers/helpers.test.ts` — see shape of helper contracts

Then skim the 2 existing specs (`gomoku.spec.ts`, `leave-room.spec.ts`) to
understand what they test — you will migrate them.

## TableCraft iron rules (ALL apply)

1. **i18n strict**: your specs must prefer `data-testid` and role-based
   selectors over Chinese/English text. When text MUST be used, read it from
   the locale file (see `tests/e2e/helpers/rooms.ts` pattern with
   `import zh from '../../../packages/client/src/i18n/locales/zh/common.json'`).
   Reason: locale changes should not break tests.

2. **App.tsx URL-sync guard**: you are not adding routes. Use existing routes.

3. **`authClient` path**: `@/lib/authClient`. API surface verified in Stage 1:
   `authClient.signUp.email({ email, password, name })`,
   `authClient.signIn.email({ email, password })`,
   `authClient.signOut()`,
   `authClient.requestPasswordReset({ email, redirectTo })` **(NOT forgetPassword)**,
   `authClient.resetPassword({ newPassword, token })`,
   `authClient.getSession()`.

4. **Server authorization is source of truth**: when a test asserts "user can't
   do X", both verify the UI prevents it AND simulate a bypass (e.g. direct
   socket.emit) to prove the server rejects. This is the "negative scenario"
   discipline.

5. **Typecheck is truth**: `pnpm typecheck` end-to-end.

6. **i18n parity is non-negotiable**: you should not be adding locale keys in
   spec-writing, but if you add any (e.g. new data-testid aria-labels), update
   BOTH zh and en `common.json`.

7. **Don't touch other workers' files**: your scope is declared below. If you
   find a bug outside scope, write it in `docs/ISSUE_e2e-stage2a-auth-rooms.md`.

## Scope fence (YOUR editable paths)

Editable:
- `tests/e2e/specs/auth/**` (new dir)
- `tests/e2e/specs/rooms/**` (new dir)
- `tests/e2e/specs/smoke/**` (new dir)
- `tests/e2e/gomoku.spec.ts` — MOVE to `tests/e2e/specs/rooms/gomoku-full-game.spec.ts`, rewritten with new helpers
- `tests/e2e/leave-room.spec.ts` — MOVE to `tests/e2e/specs/rooms/leave-room.spec.ts`, rewritten with new helpers
- `tests/e2e/helpers/multi-player.ts` — DELETE (deprecated, had wrong testids per Stage 1 ISSUE)
- `tests/e2e/helpers/wait-for.ts` — keep if still used by new specs; delete if not
- `docs/ISSUE_e2e-stage2a-auth-rooms.md` — new ISSUE doc

Adding `data-testid` to production code — ALLOWED but LIMITED SCOPE:
- `packages/client/src/pages/Lobby.tsx` — add `data-testid="create-room-btn"` to the "创建房间"/Create Room button
- `packages/client/src/pages/Room.tsx` OR wherever the room page root is — add `data-testid="room-status"` with a data attribute reflecting current status ('waiting'|'playing'|'ended')

If the file you need is elsewhere, document in ISSUE doc, don't add.

FORBIDDEN paths (Worker 2b owns these OR outside feature):
- `tests/e2e/specs/social/**`
- `tests/e2e/specs/leaderboard/**`
- `packages/client/src/pages/Me.tsx`
- `packages/client/src/components/layout/LobbySidePanel.tsx`
- `packages/client/src/pages/Leaderboard.tsx`
- `packages/server/src/**` (all server code)
- `games/**` (all game code)
- Any locale JSON unless adding 1-2 simple testid aria-labels (document in ISSUE)

Testids: you may ONLY add the 2 specific testids listed above. If a spec
requires another testid, document it in ISSUE doc and use a text fallback.

## What to write (8 specs + 2 migrations)

### A. Auth specs (3 files)

#### `tests/e2e/specs/auth/guest-flow.spec.ts`
- Guest arrives at lobby → sees auto-generated guest name in nav
- Guest can edit their display name (if UI exposes; otherwise skip that step)
- Guest can create a gomoku room → join self + start → see playing view
- Assert: the guest identity persists on page reload

#### `tests/e2e/specs/auth/email-signup.spec.ts`
- New email/password user registers → gets logged in → sees their name in nav
- Signs out → session cleared, redirected to lobby-as-guest
- Signs back in with same credentials → same userId (no duplicate account)
- Navigate to `/me` → shows email + name

**Negative scenarios:**
- Same email registered twice: second call throws typed error via authClient
- Wrong password on login: typed error (not silent failure)

#### `tests/e2e/specs/auth/password-reset.spec.ts`
- Register user → sign out
- Request password reset → Console transport prints token to server log
- Use `requestPasswordReset` helper (reads token from log)
- Call `resetPassword(token, newPassword)` → success
- Sign in with new password → works
- Sign in with old password → fails

Uses `tests/e2e/fixtures/server-log.ts` to capture server stdout.

### B. Rooms specs (3 new + 2 migrated)

#### `tests/e2e/specs/rooms/create-and-join.spec.ts`
- Alice (guest) creates a gomoku room → sees room code
- Bob (guest, separate context) enters code in quickjoin input → joins
- Alice sees Bob's name in waiting room
- Both ready up, Alice clicks start → both transition to playing view

**Negative scenarios:**
- Bob tries to join a wrong/non-existent code → UI error, no navigation
- Third player tries to join a full 2-player room → rejected

#### `tests/e2e/specs/rooms/spectate.spec.ts`
- Alice + Bob start a gomoku game
- Charlie (3rd context) sees the playing room in Lobby → clicks Spectate
- URL goes to `/rooms/:id/watch`
- Charlie sees the board in read-only overlay (pointer-events-none, banner visible)
- Charlie tries to click a board cell via `page.click(...)` — no state change
  (assert Alice/Bob's page shows no new move after Charlie's click)
- Charlie navigates back to Lobby cleanly

**Negative scenarios:**
- Charlie's direct socket.emit of a game action is rejected server-side. Use
  `connectBotSocket` with Charlie's userId (guest identity) and assert
  `game:reject` arrives.

#### `tests/e2e/specs/rooms/spectator-view-read-only.spec.ts`
- Narrow visual-regression: the spectator view's board wrapper has
  `pointer-events-none`, `opacity-55`, `saturate-50` classes
- Banner contains `spectator.banner` localized text
- All buttons inside the wrapper are `[disabled]` in the a11y tree
- No side effects on underlying game state after any number of clicks inside

#### `tests/e2e/specs/rooms/gomoku-full-game.spec.ts` (MIGRATED from gomoku.spec.ts)
- Same end-to-end test: Alice vs Bob, Alice wins
- Use new helpers: `seedGuestIdentity`, `createRoom('gomoku')`, `joinRoomByCode`,
  `readyUp`, `startGame`
- Move selectors: `[data-row="N"][data-col="M"]` (already used, keep)
- Final: `text=你赢了` via locale or testid if available; otherwise locale-read
- Goal: the spec passes, and it's now i18n-tolerant

#### `tests/e2e/specs/rooms/leave-room.spec.ts` (MIGRATED from leave-room.spec.ts)
- Same 2 tests (leave → stays in lobby; refresh → auto-rejoin)
- Use new helpers throughout
- Fixed localStorage key (via `seedGuestIdentity`)

### C. Smoke spec (1 file)

#### `tests/e2e/specs/smoke/cross-game-render.spec.ts`
- For each of the 15 games (gomoku, hive, battleship, blackjack, texas-holdem,
  connect-four, uno, love-letter, splendor, liar-bar, yahtzee, codenames,
  undercover, 2048, tic-tac-toe — verify actual list from
  `games/client-registry.ts`)
- Guest creates a room for that game via helper
- Assert that the waiting-room renders (no crash, no white screen, no console
  errors)
- Can skip UI interaction beyond that

Keep runtime bounded: use `test.describe.parallel` if helpful; add per-test
timeout.

## NEGATIVE-SCENARIO acceptance (mandatory)

Per spec file, enumerate explicit negative assertions. Template at top of each:

```ts
test.describe('<feature> — negative scenarios', () => {
  test('spectator cannot emit game action', async ({ page, browser }) => {
    // Set up spectator
    // Attempt direct action emit via socket
    // Assert server rejects
  });
});
```

Every "user cannot X" in the spec = at least 1 negative test.

## Validation (mandatory, paste output in ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Typecheck
pnpm typecheck

# 2. Unit test regression
pnpm test

# 3. E2E full suite (this is what we deliver)
pnpm test:e2e --reporter=list

# 4. i18n parity (verify locales unchanged or symmetric)
node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json');const e=require('./packages/client/src/i18n/locales/en/common.json');const flat=(o,p='')=>{const r=[];for(const k in o){if(typeof o[k]==='object'&&!Array.isArray(o[k]))r.push(...flat(o[k],p+k+'.'));else r.push(p+k)}return r};console.log('zh only:',[...new Set(flat(z))].filter(x=>!new Set(flat(e)).has(x)));console.log('en only:',[...new Set(flat(e))].filter(x=>!new Set(flat(z)).has(x)));"

# 5. Hardcoded Chinese sweep in your new files
rg '[\u4e00-\u9fff]+' tests/e2e/specs --glob '*.spec.ts' | head -40

# 6. Scope audit
git status --short
git diff --stat
```

## Deliverables

1. 8 new spec files + 2 migrations (old 2 .spec.ts files deleted or moved)
2. `pnpm typecheck` green
3. `pnpm test` green (no regression)
4. **`pnpm test:e2e` — all specs pass** (this is the real gate)
5. `docs/ISSUE_e2e-stage2a-auth-rooms.md` with 6 sections (write "None." if empty):
   - **Infrastructure gaps** — anything you needed but was outside scope (list with file + exact need)
   - **Prompt clarity** — parts of this prompt that were unclear, wrong, or led to wrong path
   - **Bugs found during testing** — real app bugs your tests revealed (this is expected; this is why we write e2e)
   - **Design choices I made where prompt was silent**
   - **Deferred / future work**
   - **Validation output** — full `pnpm test:e2e` output, typecheck result, scope audit diff

## If you find a real bug in production code

DO NOT fix it. Record in `docs/ISSUE_e2e-stage2a-auth-rooms.md` under Bugs
found during testing. Write the test as `test.fixme(...)` if the bug blocks
the spec; otherwise write an assertion that captures the bug. Orchestrator
will triage.

## Out of scope

- Worker 2b's specs (social, leaderboard) — another worker is on that
- Adding new data-testids beyond the 2 allowed
- Adding backend endpoints (including `/api/admin/reset`)
- CI workflows

START NOW. Read Stage 1 artifacts first, then write specs. Run them as you go.
Do not wait until the end to validate.
