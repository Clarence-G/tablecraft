# Developer Guide

Everything an agent or developer needs to develop, verify, and test this codebase.

---

## 1. Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Playwright browsers** (first-time): `pnpm exec playwright install chromium`

---

## 2. Running the Dev Stack

```bash
# Install all dependencies (run once, or after adding packages)
pnpm install

# Start server (port 3001) + client (port 5173) in parallel
pnpm dev
```

The client proxies `/socket.io/*` to the server, so no CORS issues in dev.

---

## 3. Verification Commands

Run these to verify correctness before committing.

```bash
# Type-check all packages (zero errors expected)
pnpm typecheck    # checks shared, game-ui, and client packages

# Lint (zero errors expected; warnings for noNonNullAssertion / noExplicitAny are OK)
pnpm lint

# Unit + integration tests (game logic and shared utilities)
pnpm test

# E2E tests — requires dev server running (pnpm dev) or auto-started by Playwright
pnpm test:e2e

# Run everything
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

---

## 4. Project Layout

```
/
├── games/                      # Game plugins (one dir per game)
│   ├── _template/              # Copy this to add a new game
│   │   ├── shared.ts           # meta, ActionSchema, Action, PlayerView types
│   │   ├── logic.ts            # Server-only game logic (GameLogic interface)
│   │   ├── Board.tsx           # Client React component
│   │   └── logic.test.ts       # Unit tests via GameTestHarness
│   ├── gomoku/                 # Gomoku (Five-in-a-Row) — reference implementation
│   ├── client-registry.ts      # Maps gameId → { meta, Board } (client bundle)
│   └── server-registry.ts      # Maps gameId → { meta, logic } (server)
│
├── packages/
│   ├── shared/                 # @repo/shared — types, utilities, test harness
│   │   └── src/
│   │       ├── types/          # GameLogic, BoardProps, socket events, room types
│   │       ├── utils/
│   │       │   └── pending-phase.ts  # Utilities for multi-player simultaneous actions
│   │       └── testing/
│   │           └── game-harness.ts   # GameTestHarness (unit-test any game logic)
│   ├── server/                 # @repo/server — Express + Socket.IO backend
│   │   └── src/
│   │       ├── engine/         # GameRoom, RoomManager, TimerManager, RandomProvider
│   │       ├── socket/         # auth.ts (Socket.IO middleware), handlers.ts (events)
│   │       └── db/             # Better-SQLite3 + Drizzle ORM (schema + migrations)
│   ├── client/                 # @repo/client — React SPA
│   │   └── src/
│   │       ├── hooks/          # useIdentity, useSocket, useRoom, useGame
│   │       ├── pages/          # Lobby, Room, Game
│   │       └── App.tsx         # Root component — all hooks hoisted here
│   └── game-ui/                # @repo/game-ui — shared React components
│       └── src/
│           ├── board/          # GridBoard, GridCell
│           ├── feedback/       # GameOverModal
│           └── player/         # PlayerBadge
│
├── tests/
│   └── e2e/
│       ├── gomoku.spec.ts      # Full E2E test for Gomoku
│       └── helpers/
│           ├── multi-player.ts # createPlayer, createRoom, joinRoom, ready, startGame
│           └── wait-for.ts     # waitForGameBoard, waitForGameOver
│
├── docs/
│   ├── tech.md                 # Full technical specification
│   └── DEVELOPMENT.md          # This file
│
├── biome.json                  # Linter/formatter config
├── playwright.config.ts        # E2E test config (port 3000, chromium only)
├── tsconfig.base.json          # Base TS config shared by all packages
└── vitest.workspace.ts         # Vitest workspace (shared, server, each game)
```

---

## 5. Key Architectural Patterns

### 5.1 Hook hoisting (critical)

All socket hooks live in `App.tsx`, not in child pages. This prevents race conditions where `game:state` or `room:state` events fire during React navigation (old component unmounted, new not yet mounted).

```tsx
// App.tsx — hooks always subscribed
const roomCtx = useRoom(socket);
const game = useGame(socket);
// Navigation is driven by roomCtx.room?.status changes
```

### 5.2 `useGame` stable snapshot

`GameStore.getSnapshot()` must return the same object reference when nothing has changed — `useSyncExternalStore` will infinite-loop if a new object is created on every call.

```ts
// packages/client/src/hooks/useGame.ts
getSnapshot = (): GameSnapshot => this._snapshot;  // stable ref

// Only create new object when state actually changes:
socket.on('game:state', (view) => {
  this._snapshot = { ...this._snapshot, state: view };
  this.notify();
});
```

### 5.3 Game plugin structure

Each game exports four artifacts:

| File | Purpose | Runs where |
|------|---------|-----------|
| `shared.ts` | `meta`, `actionSchema`, types | Both |
| `logic.ts` | Full game rules (`GameLogic`) | Server only |
| `Board.tsx` | React game UI (`BoardProps`) | Client only |
| `logic.test.ts` | Unit tests via `GameTestHarness` | Test only |

Registering a new game requires adding **two lines**:
1. `games/server-registry.ts` — add `{ meta, logic }`
2. `games/client-registry.ts` — add `{ meta, Board: lazy(...) }`

### 5.4 Game logic contract

```ts
interface GameLogic<TState, TAction, TView> {
  actions: ZodSchema<TAction>;        // Validated before onAction is called
  setup(ctx, config?): TState;        // Initialize game state
  onAction(state, action, playerId, ctx): ActionResult<TState>;
  getPlayerView(state, playerId): TView;  // Filter secrets per player
  onTimer?(state, timerName, ctx): ActionResult<TState>;  // Optional
  onPlayerDisconnect?(state, playerId, ctx): ActionResult<TState>;  // Optional
}
```

Action results:
- `{ ok: true, state: newState, events: [] }` — accepted, broadcast new views
- `{ ok: false, reason: 'message' }` — rejected, client gets `game:reject`

Engine events in `events[]`:
- `{ type: 'SET_TIMER', name: string, ms: number }` — start a timer
- `{ type: 'CLEAR_TIMER', name: string }` — cancel a timer
- `{ type: 'END_GAME', rankings: string[] }` — end the game with ordered rankings
- `{ type: 'NOTIFY', playerId: string, payload: unknown }` — send private notification
- `{ type: 'NOTIFY_ALL', payload: unknown }` — broadcast to all

---

## 6. Adding a New Game

1. **Copy the template:**
   ```bash
   cp -r games/_template games/<your-game>
   ```

2. **Edit `games/<your-game>/shared.ts`** — set `meta` (id, name, description, minPlayers, maxPlayers) and define `actionSchema`.

3. **Edit `games/<your-game>/logic.ts`** — implement `setup`, `onAction`, `getPlayerView`.

4. **Edit `games/<your-game>/Board.tsx`** — implement the React UI. The outer `<div>` must have `data-testid="game-board"`.

5. **Register the game:**
   ```ts
   // games/server-registry.ts
   import { logic as myLogic } from '@games/my-game/logic';
   import { meta as myMeta } from '@games/my-game/shared';
   export const serverRegistry = {
     [myMeta.id]: { meta: myMeta, logic: myLogic },
     // ...existing
   };
   ```
   ```ts
   // games/client-registry.ts
   import { meta as myMeta } from '@games/my-game/shared';
   export const clientRegistry = {
     [myMeta.id]: {
       meta: myMeta,
       Board: lazy(() => import('@games/my-game/board').then(m => ({ default: m.Board }))),
     },
     // ...existing
   };
   ```

6. **Add vitest config:**
   ```ts
   // games/<your-game>/vitest.config.ts  (copy from _template)
   ```
   ```ts
   // vitest.workspace.ts — add the new config path
   ```

7. **Write tests in `logic.test.ts`** using `GameTestHarness`.

8. **Verify:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```

---

## 7. Testing Guide

### Unit tests (game logic)

```bash
# Run all unit tests
pnpm test

# Run only gomoku tests
pnpm exec vitest run games/gomoku/

# Watch mode
pnpm exec vitest games/gomoku/
```

`GameTestHarness` API:

```ts
import { GameTestHarness } from '@repo/shared/testing';

const h = new GameTestHarness(logic, { players: ['Alice', 'Bob'], seed: 'test' });
h.setup();

h.action('Alice', { type: 'place', row: 7, col: 7 });  // returns ActionResult
h.view('Alice');     // PlayerView for Alice
h.rawState;          // Full internal state (white-box testing)
h.lastEvents;        // Events from the last action
h.isFinished;        // true after END_GAME event
h.rankings;          // string[] | null
h.timer('name');     // Simulate timer firing
```

### E2E tests

```bash
# Auto-starts dev server, runs all tests
pnpm test:e2e

# Interactive UI mode
pnpm exec playwright test --ui

# Keep server running for faster iteration
pnpm dev &
pnpm exec playwright test --reuse-existing-server
```

E2E helpers (`tests/e2e/helpers/`):

```ts
import { createPlayer, createRoom, joinRoom, ready, startGame } from './helpers/multi-player';
import { waitForGameBoard, waitForGameOver } from './helpers/wait-for';

const alice = await createPlayer(browser, 'Alice');
const bob = await createPlayer(browser, 'Bob');
const roomCode = await createRoom(alice, 'gomoku');
await joinRoom(bob, roomCode);
await ready(alice); await ready(bob);
await startGame(alice);
await waitForGameBoard(bob);
```

---

## 8. `data-testid` Convention

All testable UI elements must have `data-testid` attributes:

| Selector | Location |
|----------|----------|
| `[data-testid="game-card-{gameId}"]` | Lobby game card button |
| `[data-testid="room-code-input"]` | Lobby join input |
| `[data-testid="join-room-btn"]` | Lobby join button |
| `[data-testid="room-page"]` | Room page root |
| `[data-testid="room-code"]` | Room code display |
| `[data-testid="player-list"]` | Room player list |
| `[data-testid="player-{index}"]` | Individual player row |
| `[data-testid="ready-btn"]` | Ready button |
| `[data-testid="start-btn"]` | Start game button |
| `[data-testid="game-board"]` | Game board root (in each Board.tsx) |
| `[data-testid="game-over-modal"]` | GameOverModal root |
| `[data-testid="restart-btn"]` | Restart button |
| `[data-row="{r}"][data-col="{c}"]` | Board cell (gomoku) |

---

## 9. Lint & Format

```bash
# Check only
pnpm lint

# Auto-fix safe issues
pnpm lint:fix

# Format only
pnpm exec biome format --write .
```

Biome rules set to `"warn"` (not errors): `noNonNullAssertion`, `noExplicitAny`. Everything else must be error-free.

Suppression syntax (place on the line immediately before the flagged code):
```ts
// biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are stable positional keys
key={`${r}-${c}`}
```

---

## 10. Common Pitfalls

- **`getSnapshot` must return stable references** — do not create a new object on every call in `useSyncExternalStore`.
- **Biome-ignore comments must go on the line directly before the flagged code**, not inside a block.
- **All `<button>` elements need `type="button"`** (Biome `useButtonType` rule).
- **`<div onClick>` needs a keyboard handler** — use `<button>` instead (Biome `useKeyWithClickEvents`).
- **`for...of` instead of `.forEach()`** (Biome `noForEach`).
- **`node:path` not `path`** (Biome `useNodejsImportProtocol`).
- **Client `tsconfig.json` includes `../../games`** — if you add a new game, ensure its transpile path is covered by `paths` aliases.
