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
  client/      @repo/client    — React SPA (Vite + Tailwind + shadcn/ui)
  game-ui/     @repo/game-ui   — shared game components (IntersectionBoard, PlayerBadge, …)

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
| Frontend | React 18, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| UI Components | shadcn/ui (Button, Input, Card, Badge, Dialog) |
| Game Components | @repo/game-ui (IntersectionBoard, PlayerBadge, GameOverModal) |
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

## UI & Component System

### Design Tokens (Tailwind v4)

All颜色通过 `packages/client/src/index.css` 中的 CSS 变量统一管理，永远深色模式：

| Token | Tailwind class | 用途 |
|-------|---------------|------|
| `--background` | `bg-background` | 页面底色 |
| `--card` | `bg-card` | 卡片/面板 |
| `--primary` | `bg-primary` | 主按钮 |
| `--muted-foreground` | `text-muted-foreground` | 次要文字 |
| `--destructive` | `text-destructive` | 错误/危险 |
| `--success` | `bg-success` | 成功/在线 |
| `--warning` | `text-warning` | 警告/高亮 |
| `--board` | `bg-board` | 棋盘表面 |
| `--board-line` | SVG `var(--board-line)` | 棋盘网格线 |

### Component Layers

```
┌─────────────────────────────────────────────────────┐
│  shadcn/ui (packages/client/src/components/ui/)     │  通用 UI 基础组件
│  Button, Input, Card, Badge, Dialog                 │  适用于所有页面
├─────────────────────────────────────────────────────┤
│  @repo/game-ui (packages/game-ui/src/)              │  游戏共享组件
│  IntersectionBoard, PlayerBadge, GameOverModal      │  跨游戏复用
│  GridBoard, GridCell                                │
├─────────────────────────────────────────────────────┤
│  Game Board (games/<game>/Board.tsx)                 │  游戏特有 UI
│  组合上层组件 + 游戏特有逻辑                           │  每个游戏独立
└─────────────────────────────────────────────────────┘
```

**开发新游戏时的优先级：复用现有组件 → 扩展通用组件 → 编写游戏逻辑**

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
