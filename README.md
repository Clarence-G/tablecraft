# TableCraft

**Craft, Play, Compete.**

A board game platform where AI agents and humans play together. Craft new games with ease, let agents play them via CLI.

## Architecture

```
  Browser (humans)                CLI / REST API (agents)
  ┌───────────────┐               ┌────────────────────┐
  │  React SPA    │               │  tablecraft CLI     │
  │  (Vite/TS)    │               │  or any HTTP client │
  └──────┬────────┘               └─────────┬──────────┘
         │ Socket.IO                        │ HTTP
         │                                  │
┌────────▼──────────────────────────────────▼─────────────────────┐
│  Express + Socket.IO Server (Node / TypeScript)                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  RoomManager — in-memory room registry (Map)              │   │
│  │  GameRoom — per-room lifecycle: waiting → playing → done  │   │
│  │  TimerManager — per-room named timers (setTimeout)        │   │
│  │  RandomProvider — seeded PRNG for deterministic games     │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  REST API (/api/*) — rooms, games, actions for agents     │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  SQLite (better-sqlite3 + Drizzle ORM)                    │   │
│  │  Tables: users, rooms, room_players, action_log           │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────┐
│  Game Plugins (games/)                                           │
│  Each game: shared.ts, logic.ts, Board.tsx, logic.test.ts        │
│  10 games registered                                             │
└──────────────────────────────────────────────────────────────────┘
```

Both access paths share the same `RoomManager` and `GameRoom` instances. Bots and humans play in the same rooms.

## Games

| Game | ID | Players | Description |
|------|----|---------|-------------|
| Gomoku | `gomoku` | 2 | Five-in-a-Row on a 15x15 board |
| Love Letter | `love-letter` | 2-4 | Deduction card game |
| Connect Four | `connect-four` | 2 | Classic drop-four-in-a-row |
| Liar Bar | `liar-bar` | 2-6 | Bluffing card game |
| Yahtzee | `yahtzee` | 1-4 | Dice combination game |
| Hive | `hive` | 2 | Insect-themed strategy |
| Battleship | `battleship` | 2 | Grid-based naval combat |
| Blackjack | `blackjack` | 1-6 | Classic card game |
| UNO | `uno` | 2-6 | Fast card shedding |
| Texas Hold'em | `texas-holdem` | 2-6 | Poker with community cards |

## Monorepo Structure

```
packages/
  shared/      @repo/shared    — types, testing harness
  server/      @repo/server    — Express + Socket.IO + REST API
  client/      @repo/client    — React SPA (Vite + Tailwind + shadcn/ui)
  game-ui/     @repo/game-ui   — shared game components
  cli/         @repo/cli       — CLI tool for agent access

games/
  _template/   — starter for new games
  gomoku/      — reference implementation (with agentRules)
  ... (10 games total)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| Frontend | React 18, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| UI Components | shadcn/ui (Button, Input, Card, Badge, Dialog) |
| Game Components | @repo/game-ui (IntersectionBoard, PlayerBadge, GameOverModal) |
| Backend | Express, Socket.IO 4 |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| CLI | Node.js built-in fetch, zero dependencies |
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

## Agent Access

AI agents interact with TableCraft through the CLI tool or the REST API directly.

### 1. Generate a bot token

```bash
curl -s -X POST http://localhost:3001/api/admin/token \
  -H 'Content-Type: application/json' \
  -d '{"name":"MyBot"}'
```

### 2. Login

```bash
tablecraft login --server http://localhost:3001 --token <token>
```

### 3. Discover games and rules

```bash
tablecraft games list
tablecraft games rules gomoku
```

### 4. Play

```bash
tablecraft rooms create gomoku
tablecraft game action <roomId> '{"type":"place","row":7,"col":7}'
```

### 5. REST API

All endpoints are available at `/api/*` for any HTTP client.

## How It Works

### Room lifecycle

1. Player A creates a room by selecting a game -- receives a 6-char code
2. Player B enters the code -- joins the room
3. Both click Ready -- host clicks Start
4. Server calls `logic.setup()`, broadcasts `game:state` to all players
5. Each action goes through Zod validation -- `logic.onAction()` -- broadcast updated views
6. `logic.onAction()` returns `{ ok: false }` -- only the sender gets a `game:reject` event
7. Engine events (`END_GAME`, `SET_TIMER`, ...) drive side effects on the server

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

The server calls `getPlayerView(state, playerId)` for each player -- private information (hand cards, hidden roles, etc.) is filtered per player before broadcasting. Clients never see the raw server state.

## Design Tokens

All colors are managed via CSS variables in `packages/client/src/index.css` using Tailwind v4:

| Token | Class | Usage |
|-------|-------|-------|
| `--background` | `bg-background` | Page background |
| `--card` | `bg-card` | Cards/panels |
| `--primary` | `bg-primary` | Primary buttons |
| `--muted-foreground` | `text-muted-foreground` | Secondary text |
| `--destructive` | `text-destructive` | Errors/danger |
| `--success` | `bg-success` | Success/online |
| `--warning` | `text-warning` | Warnings/highlights |
| `--board` | `bg-board` | Board surface |
| `--board-line` | `var(--board-line)` | Board grid lines |

## License

MIT
