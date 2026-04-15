# Boardgames Platform

A real-time multiplayer board game platform. Players share a 6-character room code, join from any browser, and play turn-based games with live state sync.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser A                    Browser B                          │
│  ┌───────────────┐            ┌───────────────┐                  │
│  │  React SPA    │            │  React SPA    │                  │
│  │  (Vite/TS)    │            │  (Vite/TS)    │                  │
│  └──────┬────────┘            └────────┬──────┘                  │
│         │ Socket.IO                    │ Socket.IO                │
└─────────┼────────────────────────────┼──────────────────────────┘
          │                            │
┌─────────▼────────────────────────────▼──────────────────────────┐
│  Express + Socket.IO Server (Node / TypeScript)                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  RoomManager — in-memory room registry (Map)             │    │
│  │  GameRoom — per-room lifecycle: waiting → playing → done │    │
│  │  TimerManager — per-room named timers (setTimeout)       │    │
│  │  RandomProvider — seeded PRNG for deterministic games    │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  SQLite (better-sqlite3 + Drizzle ORM)                   │    │
│  │  Tables: users, rooms, room_players, action_log          │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────┐
│  Game Plugins (games/)                                          │
│  Each game: shared.ts · logic.ts · Board.tsx · logic.test.ts   │
│  Currently: gomoku                                               │
└────────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
packages/
  shared/      @repo/shared    — types, PendingPhase utils, GameTestHarness
  server/      @repo/server    — Express + Socket.IO backend
  client/      @repo/client    — React SPA (Vite + Tailwind)
  game-ui/     @repo/game-ui   — shared UI components (GridBoard, GameOverModal, …)

games/
  _template/   — starter for new games
  gomoku/      — Five-in-a-Row reference implementation
  client-registry.ts   — gameId → { meta, Board }  (client bundle)
  server-registry.ts   — gameId → { meta, logic }  (server)

tests/
  e2e/         — Playwright multi-browser tests
    helpers/   — createPlayer, joinRoom, waitForGameBoard, …
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| Frontend | React 18, Vite, Tailwind CSS v4, Framer Motion |
| Backend | Express, Socket.IO 4 |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Validation | Zod |
| Linting | Biome |
| Tests | Vitest (unit), Playwright (E2E) |
| Monorepo | pnpm workspaces |

## Getting Started

```bash
# Install
pnpm install
pnpm exec playwright install chromium   # First time only

# Develop
pnpm dev          # Server :3001 + Client :5173

# Verify
pnpm typecheck    # TSC, zero errors
pnpm lint         # Biome, zero errors
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E (auto-starts dev server)
```

For the full developer guide, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## How It Works

### Room lifecycle

1. Player A creates a room by selecting a game → receives a 6-char code
2. Player B enters the code → joins the room
3. Both click Ready → host clicks Start
4. Server calls `logic.setup()`, broadcasts `game:state` to all players
5. Each action goes through Zod validation → `logic.onAction()` → broadcast updated views
6. `logic.onAction()` returns `{ ok: false }` → only the sender gets a `game:reject` event
7. Engine events (`END_GAME`, `SET_TIMER`, …) drive side effects on the server

### Game plugins

A game plugin is four files:

| File | Responsibility | Runs |
|------|---------------|-------|
| `shared.ts` | `meta`, `actionSchema`, public types | Both |
| `logic.ts` | Full game rules (`GameLogic` interface) | Server |
| `Board.tsx` | React game UI (`BoardProps`) | Client |
| `logic.test.ts` | Unit tests via `GameTestHarness` | Tests |

The client and server each have a registry (`client-registry.ts`, `server-registry.ts`). Adding a game requires registering it in both.

### State visibility

The server calls `getPlayerView(state, playerId)` for each player — private information (hand cards, hidden roles, etc.) is filtered per player before broadcasting. Clients never see the raw server state.

## Games

| Game | ID | Players | Description |
|------|----|---------|-------------|
| Gomoku | `gomoku` | 2 | Five-in-a-Row on a 15×15 board |

## License

MIT
