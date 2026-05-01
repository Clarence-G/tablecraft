# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# E2E Stage 1 worker: Test infra & reusable helpers

You are an E2E-infrastructure worker on TableCraft. Your ONE job: build the
helpers that Stages 2 and 3 will use. You do NOT write end-user e2e specs
yourself. You produce a library of robust, reusable helpers + a seed/teardown
fixture + a README showing Stage 2/3 authors how to use them.

This is the **foundation** stage — if your helpers are buggy, all 12 downstream
specs break. Invest in correctness over speed.

## TableCraft iron rules (ALL apply)

1. **i18n strict**: zero hardcoded Chinese/English in production `.tsx`/`.ts`. In test helpers, prefer role-based / testid selectors over text selectors. If a helper MUST match translated text (e.g. "准备" button), accept the key as a parameter OR read the label via `data-testid`.

2. **App.tsx URL-sync guard**: you are not adding routes, but your helpers will navigate between them. Know the existing routes: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/me`, `/games`, `/rooms`, `/leaderboard`, `/rooms/:roomId`, `/rooms/:roomId/play`, `/rooms/:roomId/watch`.

3. **`authClient` path**: `@/lib/authClient` (not `auth-client`). It's `better-auth/react` `createAuthClient({ baseURL })`. API surface: `authClient.signUp.email({ email, password, name })`, `authClient.signIn.email({ email, password })`, `authClient.signOut()`, `authClient.forgetPassword({ email, redirectTo })`, `authClient.resetPassword({ newPassword, token })`, `authClient.getSession()`.

4. **Server authorization is source of truth**: don't have helpers that mutate localStorage to "become" an authed user. Either guest-identity via `tabletop:identity` localStorage key (legitimate guest flow) OR real email/password via authClient (legitimate email flow). No faking sessions.

5. **Typecheck is truth**: `pnpm typecheck` end-to-end. `patch` tool's isolated-file errors are false positives in this monorepo.

6. **i18n parity is non-negotiable**: if you add any locale keys (unlikely at infra layer), both `zh/common.json` and `en/common.json` must match exactly.

7. **Don't touch other workers' files**: your scope is declared below. If you find a bug outside scope, write it in `docs/ISSUE_e2e-stage1-infra.md`, don't fix.

## Scope fence (your editable paths)

Editable:
- `tests/e2e/helpers/**` — expand with new helpers; CONSOLIDATE existing into the new structure
- `tests/e2e/fixtures/**` — new dir, add per-test DB/server setup
- `tests/e2e/README.md` — new file, documents Stage 2/3 usage
- `playwright.config.ts` — minor tuning (workers count, global setup/teardown hook); DO NOT change baseURL or webServer block
- `package.json` (root) — only if you need to add `"test:e2e:reset"` or similar npm scripts

Read-only (reference):
- `tests/e2e/gomoku.spec.ts`, `tests/e2e/leave-room.spec.ts` — the 2 existing specs. DO NOT modify them, but you MAY note their drift issues (see Known Drift below) in the ISSUE doc.
- `packages/client/src/lib/authClient.ts`, `packages/client/src/hooks/useIdentity.ts`
- `packages/server/src/api/router.ts`, `packages/server/src/lib/email.ts`, `packages/server/src/api/friends.ts`, `packages/server/src/api/points.ts`

FORBIDDEN:
- Any file under `packages/{client,server,shared,game-ui}/src/**` except as read-only reference
- Any `games/**` file
- Any locale JSON (`packages/client/src/i18n/locales/**`)
- Existing specs (`tests/e2e/*.spec.ts`)

## Known drift you must fix in helpers (do NOT fix in the existing specs)

- `tests/e2e/helpers/multi-player.ts` uses `localStorage.setItem('identity', ...)` — **WRONG KEY**. The real key (per `packages/client/src/hooks/useIdentity.ts`) is `'tabletop:identity'`. Your new helpers must use the correct key. The existing specs happen to pass because they ALSO use the wrong key AND still get an auto-generated guest identity separately. Don't touch the existing specs — just produce correct helpers for Stage 2/3.
- Some helpers rely on translated button text (`"准备"`, `"开始游戏"`, `"创建"`, `"加入"`, `"房间码"`). This is i18n-fragile. Your new helpers must prefer `data-testid` selectors. Where the testid doesn't yet exist in production code, **WRITE IT IN THE ISSUE DOC**, do not add testids yourself (out of scope).

## What to build

### 1. `tests/e2e/helpers/identity.ts` — Guest identity (localStorage key)

```ts
// Seeds a guest identity via the correct 'tabletop:identity' key.
// Must be called AFTER page.goto but BEFORE any socket-dependent action,
// OR use page.addInitScript before goto. Document both patterns in jsdoc.
export async function seedGuestIdentity(
  page: Page,
  opts: { userId?: string; userName: string }
): Promise<{ userId: string; userName: string }>;
```

Requirements:
- Use `page.addInitScript` variant internally so identity is present before any React code runs (prevents race with useIdentity)
- Return resolved `{ userId, userName }` (generate a nanoid-style id if not given)
- Handle the case where the caller wants a deterministic userId (for cross-session reconnect tests)

### 2. `tests/e2e/helpers/auth.ts` — Email signup / login / forgot-password

```ts
export async function signUpEmail(page: Page, opts: {
  email: string;
  password: string;
  name: string;
}): Promise<void>;

export async function signInEmail(page: Page, opts: {
  email: string;
  password: string;
}): Promise<void>;

export async function signOut(page: Page): Promise<void>;

/**
 * Request a password reset email. Returns the token from the Console email
 * transport (reads server stdout). Only works when EMAIL_TRANSPORT=console
 * or not set (default in dev).
 */
export async function requestPasswordReset(
  page: Page,
  email: string,
  serverLogPath: string
): Promise<string>;

export async function resetPassword(page: Page, opts: {
  token: string;
  newPassword: string;
}): Promise<void>;
```

Implementation notes:
- Use `page.evaluate` to call `authClient.signUp.email()` etc. directly from the page context, not UI clicks. UI flow belongs in Stage 2 specs.
- For `requestPasswordReset`, the ConsoleTransport prints `[email] password-reset-token for <email>: <token>` (or similar — verify against `packages/server/src/lib/email.ts`). Read the server log file (passed in) with a polling retry (wait up to 5s).
- Document in JSDoc: "Stage 2 specs should use these for programmatic auth setup, not for testing the UI flow itself — for UI-flow tests, use Playwright's click/fill on the forms."

### 3. `tests/e2e/helpers/rooms.ts` — Room lifecycle

```ts
export async function createRoom(page: Page, gameId: string): Promise<string>;  // returns room code

export async function joinRoomByCode(page: Page, code: string): Promise<void>;

export async function spectateRoom(page: Page, code: string): Promise<void>;

export async function readyUp(page: Page): Promise<void>;

export async function startGame(page: Page): Promise<void>;

export async function leaveRoom(page: Page): Promise<void>;

/** Returns the room's current status as reported by the UI. */
export async function getRoomStatus(page: Page): Promise<'waiting' | 'playing' | 'ended'>;
```

Implementation notes:
- Prefer `data-testid` selectors. If a testid is missing in production, document the need in the ISSUE doc (do NOT add testids yourself).
- For text-based fallback (`"准备"`, `"开始游戏"`), read the label from `packages/client/src/i18n/locales/zh/common.json` at import time so switching locales later doesn't break. Example:
  ```ts
  import zh from '../../../packages/client/src/i18n/locales/zh/common.json';
  const READY_LABEL = zh.room?.ready ?? '准备';
  ```
  (Verify the actual key path against the real locale file.)

### 4. `tests/e2e/helpers/bots.ts` — Bot tokens & socket.io-client protocol testing

Uses the `/api/admin/token` endpoint (no auth required in dev — bootstrap-for-automation).

```ts
export async function mintBotToken(opts: { name: string; serverUrl?: string }): Promise<{
  token: string;
  userId: string;
}>;

/**
 * Connect a socket.io-client as a bot (not a Playwright page).
 * Used for protocol-level tests in Stage 3.
 */
export async function connectBotSocket(opts: {
  token: string;
  serverUrl?: string;
}): Promise<import('socket.io-client').Socket>;

/** Ask a bot to take an action via socket, return the ack reply. */
export async function botAction(
  socket: Socket,
  payload: unknown
): Promise<{ ok: boolean; error?: { code: string; message: string } }>;
```

Implementation notes:
- `socket.io-client` is already a transitive dep of @repo/client; make it a direct devDep of the root (`pnpm add -D -w socket.io-client`) so tests can import it.
- Use `socket.emitWithAck('action', payload, { timeout: 5000 })` — the server uses acks.

### 5. `tests/e2e/fixtures/db-reset.ts` — Per-spec DB isolation

Goal: a spec can call `await resetDb()` in `test.beforeEach` and get a clean state, so tests don't pollute each other.

Approach (pick the safer one):
- **Option A (safer, slower)**: spawn a fresh server with a unique `DATA_DIR` per test file. 
- **Option B (faster, harder)**: call an authenticated `/api/admin/reset` endpoint if one exists. Grep `packages/server/src/api/` — if there's no reset endpoint, **DO NOT add one** (out of scope). Note in ISSUE doc as Infrastructure Gap.

Default to Option A. Document what you did clearly in `tests/e2e/README.md`.

If per-test-file isolation is too heavy (slow CI), document a hybrid: one fresh server per Stage (2, 3), and within a stage tests share state but are designed not to conflict (unique room codes, unique emails).

### 6. `tests/e2e/fixtures/server-log.ts` — Read server stdout

Helper for the password-reset flow and any other test that needs to read server side-effects.

```ts
/**
 * Start the server with its stdout piped to a file, return the log path.
 * Caller is expected to tail the file or grep for specific patterns.
 */
export async function startServerWithLog(opts: {
  dataDir?: string;
  port?: number;
}): Promise<{ pid: number; logPath: string; kill: () => Promise<void> }>;
```

This is tightly related to `db-reset.ts` Option A. Decide together.

### 7. `tests/e2e/README.md` — Usage guide for Stage 2/3 authors

Document:
- How to write a new e2e spec from scratch using these helpers (a small example)
- Which key selectors are testid-based vs text-based
- Which helpers are idempotent (safe to call twice) vs not
- How to run the e2e suite locally (`pnpm test:e2e`) and how to debug a failure (Playwright UI mode, trace viewer)
- The per-test DB isolation model you picked and its implications for test authors

### 8. `playwright.config.ts` — minor updates

- Add a `globalSetup` hook that ensures the server starts with a clean state before the first test, if needed (depends on your db-reset approach)
- Add `globalTeardown` to clean up
- Keep `workers: 1` initially (parallel e2e requires per-worker DB isolation — don't paralelize until Stage 3 is green)

## NEGATIVE-SCENARIO acceptance (mandatory)

Your helpers themselves are tested infrastructure, not user-facing features, so "negative scenarios" for YOU means "helpers must be robust when abused":

- [ ] `seedGuestIdentity` called twice on the same page: doesn't duplicate identity, second call overrides first cleanly
- [ ] `signUpEmail` called with an email that already exists: throws a typed error, not a silent no-op
- [ ] `signInEmail` called with wrong password: throws a typed error
- [ ] `createRoom` called when server is not responding: throws with a timeout error, not a hung helper
- [ ] `requestPasswordReset` called when no reset email arrives within 5s: throws, not infinite wait
- [ ] `mintBotToken` called when `/api/admin/token` returns non-2xx: throws with the status code in the message
- [ ] Helpers do not swallow errors and return `undefined` — every failure surfaces a typed exception
- [ ] `connectBotSocket` timeout if socket doesn't connect within a bound, throws

Add a minimal `tests/e2e/helpers/helpers.test.ts` (vitest, NOT playwright) that verifies at least:
- `seedGuestIdentity` writes the correct localStorage key
- `mintBotToken` talks to `/api/admin/token` correctly (mock fetch)

You do NOT need to test every helper — Stage 2/3 specs will exercise them. But the shape + error-handling contract must be verified.

## Validation (run these, copy output into ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Typecheck
pnpm typecheck

# 2. Unit tests (helpers.test.ts if you wrote one, + existing)
pnpm test

# 3. Regression: existing e2e specs still pass
# (assume server is running; caller of this worker will confirm)
pnpm test:e2e

# 4. i18n parity (you shouldn't have touched locales, but verify)
node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json');const e=require('./packages/client/src/i18n/locales/en/common.json');const flat=(o,p='')=>{const r=[];for(const k in o){if(typeof o[k]==='object'&&!Array.isArray(o[k]))r.push(...flat(o[k],p+k+'.'));else r.push(p+k)}return r};const zk=new Set(flat(z));const ek=new Set(flat(e));console.log('zh only:',[...zk].filter(x=>!ek.has(x)));console.log('en only:',[...ek].filter(x=>!zk.has(x)));"

# 5. Scope audit
git diff --stat
# Expected: only files under your scope fence
```

## Deliverables

1. All 8 items above (helpers 1-6, README, playwright config)
2. `pnpm typecheck` green
3. `pnpm test` green (new helpers.test.ts file passes, nothing else broken)
4. `pnpm test:e2e` green (existing 2 specs still pass, regression-free)
5. `docs/ISSUE_e2e-stage1-infra.md` with ALL 6 sections (write "None." if empty):
   - **Infrastructure gaps** — missing testids in production code that your helpers need but you didn't add (list file + exact selector needed); any reset-endpoint absence; any other gaps
   - **Prompt clarity** — parts of this prompt that were unclear, wrong, or led you down a wrong path
   - **Bugs found during testing** — existing specs, authClient, anything you noticed
   - **Design choices I made where prompt was silent** — e.g. how you structured socket.io-client imports, which db-reset option you picked and why
   - **Deferred / future work** — what would make Stage 2/3 smoother but was out of scope
   - **Validation output** — paste the typecheck, tests, e2e output. Truncate to first/last 40 lines if huge.
6. i18n parity verified

## If you find a bug in production code

DO NOT fix it. Record in `docs/ISSUE_e2e-stage1-infra.md` under Infrastructure gaps. The orchestrator will triage.

## Out of scope (do NOT do these, even if tempting)

- Writing end-user e2e specs (no `tests/e2e/*.spec.ts` new files except the existing 2 — Stage 2 does this)
- Adding `data-testid` attributes to production components (document the need, don't add)
- Adding `/api/admin/reset` endpoint (document the need)
- Changing the existing `gomoku.spec.ts` or `leave-room.spec.ts` (they work; leave them)
- Adding CI workflows (separate concern)
- Changing any game logic, UI, or server business logic

START NOW. Read the reference files first, then write the helpers + fixtures + README + ISSUE doc.
