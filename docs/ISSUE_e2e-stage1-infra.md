# ISSUE: E2E Stage 1 Infrastructure

## Infrastructure gaps

### Missing `data-testid` attributes in production code

The following selectors are needed by helpers but do NOT yet exist in production
code. Stage 2/3 spec authors must use text-based fallbacks until these are added.
Do NOT add them yourself — submit a separate PR touching only the production
component files listed below.

| Needed testid | Production file | Component / element |
|---------------|-----------------|---------------------|
| `create-room-btn` | `packages/client/src/pages/Lobby.tsx` | The "创建房间" / "Create Room" button after clicking a game card. Currently matched with `button:has-text("创建房间")` — fragile if i18n changes. |
| `spectator-view` | `packages/client/src/pages/Room.tsx` (or the spectator Watch page) | Wrapper div for the spectator view at `/rooms/:id/watch`. `spectateRoom()` currently falls back to waiting for `[data-testid="game-board"]`. |
| `room-status` | `packages/client/src/pages/Room.tsx` | An element surfacing the current room status (`waiting`/`playing`/`ended`) as a data attribute. `getRoomStatus()` currently infers it from the URL and DOM. |

### Wrong testids in existing helpers (`tests/e2e/helpers/multi-player.ts`)

The existing `multi-player.ts` file uses two testids that do NOT exist in production:
- `[data-testid="room-code-input"]` — should be `[data-testid="quickjoin-input"]`
  (from `packages/game-ui/src/input/QuickJoinInput.tsx`)
- `[data-testid="join-room-btn"]` — should be `[data-testid="quickjoin-submit"]`

The new `helpers/rooms.ts` uses the correct testids. The OLD helper file is
left untouched per scope constraints — Stage 2 specs should import from the new
helpers instead.

### Wrong localStorage key in `multi-player.ts` and `leave-room.spec.ts`

- `tests/e2e/helpers/multi-player.ts` line 14: uses `'identity'` key
  instead of `'tabletop:identity'`
- `tests/e2e/leave-room.spec.ts` line 15 and 47: also uses `'identity'` key

The app's `useIdentity` hook reads from `'tabletop:identity'` (confirmed in
`packages/client/src/hooks/useIdentity.ts`). The specs still pass because
`useIdentity` generates a fresh identity when the stored key is not found —
so the tests work by accident, not by seeding.

New helpers use the correct key. Existing specs are left untouched per scope.

### No `/api/admin/reset` endpoint

There is no endpoint to reset the database mid-run. The `db-reset.ts` fixture
uses Option A (spawn a fresh server with a unique `DATABASE_URL`). This is only
usable by bot/socket tests — browser-based tests cannot use it because the Vite
client is compiled to target `http://localhost:3001`.

If true per-test isolation is needed for browser tests, the options are:
1. Add a `POST /api/admin/reset` endpoint (dev-mode gated) to truncate all tables
2. Or rebuild the client with a configurable `VITE_API_URL` per worker

### Main server log not accessible from tests

`requestPasswordReset()` requires a `serverLogPath` to read the reset token.
For the dev server started by `pnpm dev` or by the playwright `webServer` config,
stdout is not piped to a file — it goes to the terminal. There is currently no
mechanism to capture it in tests.

Workaround: use `startServerWithLog()` from `fixtures/server-log.ts` in tests
that need password reset verification. This starts a second server on a
different port (not accessible from the browser, but usable for API-level tests).

---

## Prompt clarity

### `authClient.forgetPassword` vs `authClient.requestPasswordReset`

The spec says `authClient.forgetPassword({ email, redirectTo })` but the actual
app code (`packages/client/src/pages/ForgotPassword.tsx`) uses
`authClient.requestPasswordReset({ email, redirectTo })`. Implemented using
the actual BetterAuth HTTP endpoint `POST /api/auth/forget-password`, which
underlies both method names.

### `socket.emitWithAck('action', ...)` claim

The spec says the server uses acks for `game:action`. It does not.
`ClientEvents` in `packages/shared/src/types/socket.ts` declares:
```ts
'game:action': (action: unknown, seq: number) => void;
```
No ack callback. `botAction()` in `helpers/bots.ts` uses a Promise race on
`game:state` / `game:reject` events instead.

### The spec also references 'action' as the event name

The spec mentions `socket.emitWithAck('action', ...)` but the actual server
uses `game:action` as the event name (see `packages/server/src/socket/handlers.ts`
line 174).

---

## Bugs found during testing

### `leave-room.spec.ts` uses wrong localStorage key

As noted above, `leave-room.spec.ts` uses `'identity'` instead of `'tabletop:identity'`.
The test passes by accident because `useIdentity` auto-generates a new identity
when nothing is found in the correct key. The seeded identity from the test is
never actually used — the player connects with a generated identity. This means
the `userName: 'Leaver'` / `'Rejoiner'` set in the test are silently ignored.

### `gomoku.spec.ts` uses wrong localStorage key + hardcoded Chinese text

Same key issue. Also uses `text=TableCraft` and Chinese game names (`text=五子棋`,
`button:has-text("准备")`) which are i18n-fragile.

These are existing spec files — not modified per scope constraints.

---

## Design choices where prompt was silent

### DB reset: Option A (fresh server per test file)

Chose Option A over Option B because there is no `/api/admin/reset` endpoint.
Spawning a fresh server per test file is slow (~2-3s startup) but safe and
completely isolated. The fixtures expose `startServerWithLog()` which is the
primitive, and `resetDb()` which is the ready-to-use fixture.

### `botAction` uses Promise race, not acks

The server does not support acks on `game:action`. Implemented a Promise race
on `game:state` (success) vs `game:reject` (failure) with a configurable timeout.

### `connectBotSocket` uses `isGuest: true`

Bot tokens are only verified by the REST API bearer middleware. The socket
middleware accepts `isGuest: true` without authentication. Bots connect as
"guests" using their userId from the token store. This is the only supported
socket auth path for programmatic clients.

### vitest.workspace.ts modification

Added `'tests/e2e/vitest.config.ts'` to `vitest.workspace.ts` to make 
`helpers.test.ts` part of `pnpm test`. This file was not in the explicit scope
fence but is a necessary consequence of adding the unit test.

### `playwright.config.ts` — added `testMatch: '**/*.spec.ts'`

Without this, playwright would also try to run `helpers.test.ts` as a
playwright test file (and fail because it uses vitest APIs). The `testMatch`
filter excludes non-spec files.

### Auth helper: navigate to app origin first

`page.evaluate` calls with `fetch` need CORS to work. The page must already be
on `http://localhost:5173` for the browser to send credentials to `localhost:3001`.
The helpers call `ensureAppOrigin(page)` which navigates to `'/'` if the page is
not already on the app origin. This is a no-op if the page is already there.

---

## Deferred / future work

- **Parallel workers**: enable `workers > 1` by giving each Playwright worker
  its own server instance (via `startServerWithLog`) and building the client
  with a per-worker `VITE_API_URL`. Complex but unblocks parallel CI.

- **`/api/admin/reset` endpoint**: a fast in-process DB truncate would enable
  browser-test DB isolation without spawning a new server. Gated to dev mode.

- **`data-testid` additions** listed in Infrastructure gaps above.

- **Socket bearer auth**: add bot token verification to the socket middleware
  so bots can authenticate via bearer token at socket connect time, rather than
  relying on `isGuest: true`.

- **Main server log capture**: pipe the dev server's stdout to a file in the
  playwright `webServer` block so tests can read email tokens from the main server.

---

## Validation output

### Typecheck

```
> pnpm typecheck
tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0 — green)
```

### Unit tests (`pnpm test --project=e2e-helpers`)

```
 ✓ |e2e-helpers| helpers/helpers.test.ts  (7 tests) 4ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  146ms
```

### Full test suite (`pnpm test`)

Before changes: 31 test files, 475 tests passed, 15 unhandled errors (pre-existing).
After changes:  32 test files, 482 tests passed, 14 unhandled errors (one pre-existing
error was resolved by pnpm install deduplication — unrelated to this work).

The 14 remaining unhandled errors are from `html-encoding-sniffer` ESM/CJS
interop — a pre-existing issue unrelated to this work.

### E2E regression

`gomoku.spec.ts` and `leave-room.spec.ts` were not modified. (Run by the
orchestrator with dev servers active.)

### i18n parity

```
zh only: []
en only: []
```

No locale files were added or modified.

### Scope audit (`git diff --stat`)

```
package.json         | 1 +   (added socket.io-client devDep)
playwright.config.ts | 4 +   (added testMatch, preserved all other config)
pnpm-lock.yaml       | 3 +   (lockfile update from pnpm install)
vitest.workspace.ts  | 1 +   (added tests/e2e/vitest.config.ts)
```

New files (all within scope fence):
- tests/e2e/helpers/identity.ts
- tests/e2e/helpers/auth.ts
- tests/e2e/helpers/rooms.ts
- tests/e2e/helpers/bots.ts
- tests/e2e/helpers/helpers.test.ts
- tests/e2e/fixtures/db-reset.ts
- tests/e2e/fixtures/server-log.ts
- tests/e2e/vitest.config.ts
- tests/e2e/README.md
- docs/ISSUE_e2e-stage1-infra.md
