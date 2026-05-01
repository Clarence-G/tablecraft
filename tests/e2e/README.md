# E2E Test Infrastructure

This directory contains end-to-end tests for TableCraft using Playwright, plus
a library of reusable helpers for Stage 2 and Stage 3 spec authors.

## Quick start

```bash
# Ensure the dev server is running first
pnpm dev

# Run all e2e specs
pnpm test:e2e

# Run a single spec in UI mode (trace, screenshot, step-by-step)
pnpm exec playwright test leave-room.spec.ts --ui

# Run with trace viewer (after a failure)
pnpm exec playwright show-report
```

Run the helper unit tests (vitest, no browser needed):

```bash
pnpm test --project=e2e-helpers
```

---

## Writing a new e2e spec

### Minimal example

```ts
// tests/e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';
import { seedGuestIdentity } from './helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame } from './helpers/rooms';

test.describe('My feature', () => {
  test('two players can start a game', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const alice = await ctx1.newPage();
    const bob   = await ctx2.newPage();

    // Seed guest identities BEFORE goto — prevents useIdentity race
    await seedGuestIdentity(alice, { userName: 'Alice' });
    await seedGuestIdentity(bob,   { userName: 'Bob' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);

    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice); // host starts

    expect(await alice.locator('[data-testid="game-board"]').isVisible()).toBe(true);

    await ctx1.close();
    await ctx2.close();
  });
});
```

### Programmatic auth setup

Use helpers from `helpers/auth.ts` to set up signed-in users without clicking
through the UI. Reserve the UI forms for tests that specifically test the auth
UI flow.

```ts
import { signUpEmail, signInEmail, signOut } from './helpers/auth';

// Create an account and immediately sign in (BetterAuth auto-signs-in on signup)
await signUpEmail(alice, {
  email: `alice-${Date.now()}@test.local`,
  password: 'secret123',
  name: 'Alice',
});

// Later, sign in on a fresh page
await signInEmail(bob, { email: 'bob@test.local', password: 'secret123' });
```

**Important:** Use unique emails per test run (e.g. append `Date.now()`) since
tests share a server and emails cannot be reused once registered, unless you
use the isolated server fixture.

---

## Helpers reference

### `helpers/identity.ts`

| Export | Idempotent? | Notes |
|--------|-------------|-------|
| `seedGuestIdentity(page, { userId?, userName })` | Yes (second call wins) | Call BEFORE `page.goto`. Uses `tabletop:identity` key. |
| `IDENTITY_KEY` | — | The exact localStorage key string. |

### `helpers/auth.ts`

| Export | Idempotent? | Notes |
|--------|-------------|-------|
| `signUpEmail(page, { email, password, name })` | No — throws if email exists | Navigates to `/` first if page is blank |
| `signInEmail(page, { email, password })` | No — throws on wrong password | |
| `signOut(page)` | Yes | |
| `requestPasswordReset(page, email, logPath)` | No — throws after 5s if no email | Requires server stdout piped to `logPath` |
| `resetPassword(page, { token, newPassword })` | No — token can only be used once | |

All auth helpers use direct `fetch` calls to the BetterAuth API (`http://localhost:3001`),
not UI interactions. This makes them fast and avoids false failures from UI changes.

### `helpers/rooms.ts`

| Export | Idempotent? | Selector strategy | Notes |
|--------|-------------|-------------------|-------|
| `createRoom(page, gameId)` | No — creates a new room each call | game card: testid; create btn: **zh text fallback** | Returns room code |
| `joinRoomByCode(page, code)` | No | quickjoin-input / quickjoin-submit testids | |
| `spectateRoom(page, code)` | Yes | Direct URL navigation | |
| `readyUp(page)` | No | `ready-btn` testid | |
| `startGame(page)` | No | `start-btn` testid | |
| `leaveRoom(page)` | No | `leave-btn` testid | |
| `getRoomStatus(page)` | Yes | URL + DOM check | Returns `'waiting' \| 'playing' \| 'ended'` |

**Missing testids** (text fallbacks used instead): see `ISSUE_e2e-stage1-infra.md`
for the full list and which production files need the testids added.

### `helpers/bots.ts`

For protocol-level tests that bypass the browser entirely.

```ts
import { mintBotToken, connectBotSocket, botAction } from './helpers/bots';

const { token, userId } = await mintBotToken({ name: 'TestBot' });
const socket = await connectBotSocket({ token, userId });

// Join a room via socket
socket.emit('room:join', roomId, 'TestBot', (ack) => { /* ... */ });

// Take a game action and wait for response
const result = await botAction(socket, { type: 'place', row: 0, col: 0 });
// result: { ok: boolean; error?: { code, message } }

socket.disconnect();
```

Note: `botAction` uses a Promise-race on `game:state` / `game:reject` events
(not socket acks, since the server's `game:action` event does not use acks).

---

## DB isolation model

### Current model: shared server, unique-per-test identifiers

Browser-based Playwright tests share the main server on `http://localhost:3001`.
The Vite client is built to talk to port 3001 and this cannot be changed at
runtime. To avoid test conflicts:

- Use unique emails: `alice-${Date.now()}@test.local`
- Use unique room codes (they're generated server-side, no action needed)
- Tests in the same file run serially (`workers: 1`) so state conflicts are rare

### Isolated server (bot/API tests only)

For bot socket tests that need a clean DB, use `resetDb()` from
`fixtures/db-reset.ts`. This spawns a fresh server on a different port with
its own PGlite data directory:

```ts
import { test } from '@playwright/test';
import { resetDb } from './fixtures/db-reset';

test.describe('Bot protocol tests', () => {
  let server: Awaited<ReturnType<typeof resetDb>>;

  test.beforeAll(async () => {
    server = await resetDb(13001);
  });

  test.afterAll(async () => {
    await server.kill();
  });

  test('bot can mint token and join room', async () => {
    const { token, userId } = await mintBotToken({
      name: 'TestBot',
      serverUrl: server.serverUrl,
    });
    // ...
  });
});
```

The isolated server is NOT usable for browser Playwright tests because the
Vite client is hardwired to port 3001.

### Password reset emails

The isolated server from `resetDb()` also provides `logPath` for email
token extraction:

```ts
const { token } = await requestPasswordReset(page, email, server.logPath);
```

For the main server, there is currently no mechanism to read its log file
from tests. See `ISSUE_e2e-stage1-infra.md` for the gap description.

---

## Debugging failures

```bash
# Run with headed browser (see what's happening)
pnpm exec playwright test --headed

# Debug a single test interactively
pnpm exec playwright test gomoku.spec.ts --debug

# Open Playwright's UI mode (trace, video, screenshots)
pnpm exec playwright test --ui

# Show HTML report after a run
pnpm exec playwright show-report
```

Traces are captured on first retry (`trace: 'on-first-retry'` in `playwright.config.ts`).
In CI, download the playwright-report artifact to inspect them locally.

---

## Parallelization

`workers: 1` is intentional. Parallel Playwright workers need per-worker DB and
server isolation, which is not yet implemented. Stage 3 will introduce this if
needed — see `ISSUE_e2e-stage1-infra.md` for the deferred work item.
