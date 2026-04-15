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
│   │       ├── components/ui/  # shadcn/ui components (Button, Input, Card, Badge, Dialog)
│   │       ├── lib/utils.ts    # cn() — Tailwind class merging utility
│   │       ├── hooks/          # useIdentity, useSocket, useRoom, useGame
│   │       ├── pages/          # Lobby, Room, Game
│   │       ├── index.css       # Tailwind v4 + Design Tokens (all CSS variables)
│   │       └── App.tsx         # Root component — all hooks hoisted here
│   └── game-ui/                # @repo/game-ui — shared game components
│       └── src/
│           ├── board/          # IntersectionBoard, GridBoard, GridCell
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

## 5. UI & Component System

### 5.1 Design Tokens

所有颜色、圆角通过 `packages/client/src/index.css` 中的 CSS 变量统一管理。项目永远使用深色模式（`:root` 直接定义深色值）。

**核心 Token：**

| 变量 | Tailwind class | 用途 |
|------|---------------|------|
| `--background` | `bg-background` | 页面底色（最深） |
| `--card` | `bg-card` | 卡片、面板背景 |
| `--secondary` | `bg-secondary` | 次要按钮、输入框背景 |
| `--primary` | `bg-primary` | 主按钮 |
| `--muted-foreground` | `text-muted-foreground` | 次要文字、描述 |
| `--border` | `border-border` | 边框（半透明白） |
| `--destructive` | `text-destructive` | 错误、危险操作 |
| `--success` | `bg-success` / `text-success` | 成功、在线状态 |
| `--warning` | `text-warning` | 警告、高亮、房主标记 |

**游戏专用 Token（棋盘类）：**

| 变量 | 用途 | 使用方式 |
|------|------|---------|
| `--board` | 棋盘木色表面 | `bg-board` |
| `--board-line` | 棋盘网格线 | SVG `stroke="var(--board-line)"` |

添加新游戏的自定义颜色时，在 `index.css` 的 `:root` 和 `@theme inline` 中同时添加变量。

### 5.2 Component Layers

开发新游戏 UI 时，按以下优先级使用组件：

```
优先级 1 → 复用现有组件
优先级 2 → 扩展 @repo/game-ui 通用组件
优先级 3 → 在 games/<game>/Board.tsx 中编写游戏特有 UI
```

**第一层：shadcn/ui 基础组件** (`packages/client/src/components/ui/`)

通用 UI 组件，适用于所有页面（大厅、等待室、游戏内弹窗）。

| 组件 | 用途 | 使用场景 |
|------|------|---------|
| `Button` | 按钮（多种 variant：default/outline/secondary/ghost/destructive） | 准备、开始、加入 |
| `Input` | 输入框 | 房间码输入 |
| `Card` + `CardHeader/Content/Footer` | 卡片容器 | 加入房间面板、玩家列表 |
| `Badge` | 标签/徽章 | 状态标记 |
| `Dialog` | 模态弹窗 | 确认、设置 |

添加新组件：`npx shadcn@latest add <component-name>`

**第二层：@repo/game-ui 游戏共享组件** (`packages/game-ui/src/`)

跨游戏复用的游戏专属组件。**开发新游戏前，先检查这里是否已有合适的组件。**

| 组件 | 路径 | 用途 | 适用游戏 |
|------|------|------|---------|
| `IntersectionBoard` | `board/` | 交叉点棋盘（SVG 网格 + 落子 + 响应式） | 五子棋、围棋、黑白棋 |
| `GridBoard` | `board/` | 格子棋盘（CSS Grid） | 国际象棋、跳棋等 |
| `GridCell` | `board/` | 单个格子按钮 | 配合 GridBoard |
| `PlayerBadge` | `player/` | 玩家徽章（名字、在线状态、回合指示） | 所有游戏 |
| `GameOverModal` | `feedback/` | 游戏结束弹窗（排名、胜负） | 所有游戏 |

**`IntersectionBoard` Props：**

```tsx
<IntersectionBoard
  size={15}                              // 棋盘大小
  stones={state.board}                   // (Stone | null)[][] 棋盘状态
  starPoints={[[3,3],[7,7],[11,11]]}     // 星位坐标
  previewStone={state.myStone}           // hover 预览棋子颜色
  canPlace={(r, c) => ...}              // 哪些位置可下
  onPlace={(r, c) => sendAction(...)}   // 点击回调
  renderOverlay={(r, c) => <Marker />}  // 游戏特有装饰层（如围棋领地标记）
/>
```

**第三层：游戏特有 UI** (`games/<game>/Board.tsx`)

组合上层组件，加上游戏特有的布局和交互。参考 `games/gomoku/Board.tsx`。

### 5.3 响应式设计

所有页面和游戏必须同时支持 **PC 端和手机端**。

- 页面布局：使用 `max-w-*` + `mx-auto` 居中，移动端自适应
- 棋盘类：`IntersectionBoard` 已内置响应式（`min()` 容器宽度 + `viewBox` SVG + `1fr` Grid）
- 触控目标：移动端按钮/交互区域不小于 44×44px
- 测试：开发时缩放浏览器到 375px 宽度验证

### 5.4 扩展通用组件指南

当多个游戏需要相同 UI 模式时，应将其提升到 `@repo/game-ui`：

1. 在 `packages/game-ui/src/` 对应目录下创建组件
2. 从 `index.ts` 导出
3. Props 设计原则：核心数据 + 回调函数 + 可选渲染插槽（`renderOverlay`）
4. 样式使用 Design Token（`bg-card`、`text-muted-foreground` 等），不要硬编码颜色

**适合提升为通用组件的信号：**
- 两个以上游戏有相同的 UI 结构
- 卡牌手牌展示、骰子动画、投票面板、聊天框等

---

## 6. Key Architectural Patterns

### 6.1 Hook hoisting (critical)

All socket hooks live in `App.tsx`, not in child pages. This prevents race conditions where `game:state` or `room:state` events fire during React navigation (old component unmounted, new not yet mounted).

```tsx
// App.tsx — hooks always subscribed
const roomCtx = useRoom(socket);
const game = useGame(socket);
// Navigation is driven by roomCtx.room?.status changes
```

### 6.2 `useGame` stable snapshot

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

### 6.3 Game plugin structure

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

### 6.4 Game logic contract

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

## 7. Adding a New Game

### 开发流程

```
1. 检查通用组件  →  能复用就复用
2. 缺少通用组件  →  先在 @repo/game-ui 中扩展
3. 编写游戏逻辑  →  shared.ts + logic.ts + logic.test.ts
4. 编写游戏 UI   →  Board.tsx（组合通用组件）
5. 注册 + 验证   →  registry + typecheck + lint + test
```

### 具体步骤

1. **Copy the template:**
   ```bash
   cp -r games/_template games/<your-game>
   ```

2. **Edit `games/<your-game>/shared.ts`** — set `meta` (id, name, description, minPlayers, maxPlayers) and define `actionSchema`.

3. **Edit `games/<your-game>/logic.ts`** — implement `setup`, `onAction`, `getPlayerView`.

4. **Edit `games/<your-game>/Board.tsx`** — implement the React UI.
   - The outer `<div>` must have `data-testid="game-board"`
   - Use Design Token classes (`bg-background`, `text-muted-foreground`, etc.)
   - Use `@repo/game-ui` components (`PlayerBadge`, `GameOverModal`, `IntersectionBoard`, etc.)
   - Use `@/components/ui/*` for buttons, inputs, cards
   - **Must support PC and mobile** — test at 375px width

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

6. **Add Vite alias** (in `packages/client/vite.config.ts`):
   ```ts
   { find: '@games/<your-game>/shared', replacement: path.resolve(root, 'games/<your-game>/shared.ts') },
   { find: '@games/<your-game>/board', replacement: path.resolve(root, 'games/<your-game>/Board.tsx') },
   ```
   Note: the generic regex alias `@games/(.+)/board` already handles Board.tsx — you only need to add the `shared` alias.

7. **Add vitest config:**
   ```ts
   // games/<your-game>/vitest.config.ts  (copy from _template)
   ```
   ```ts
   // vitest.workspace.ts — add the new config path
   ```

8. **Write tests in `logic.test.ts`** using `GameTestHarness`.

9. **Verify:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```

---

## 8. Testing Guide

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

## 9. `data-testid` Convention

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

## 10. Lint & Format

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

## 11. Common Pitfalls

- **`getSnapshot` must return stable references** — do not create a new object on every call in `useSyncExternalStore`.
- **Biome-ignore comments must go on the line directly before the flagged code**, not inside a block.
- **All `<button>` elements need `type="button"`** (Biome `useButtonType` rule).
- **`<div onClick>` needs a keyboard handler** — use `<button>` instead (Biome `useKeyWithClickEvents`).
- **`for...of` instead of `.forEach()`** (Biome `noForEach`).
- **`node:path` not `path`** (Biome `useNodejsImportProtocol`).
- **Client `tsconfig.json` includes `../../games`** — if you add a new game, ensure its transpile path is covered by `paths` aliases.
- **Design Token** — 不要在组件中硬编码颜色（如 `bg-gray-800`），使用 token class（如 `bg-card`）。
- **`@source` in index.css** — `games/` 目录通过 `@source "../../../games"` 被 Tailwind 扫描，新游戏目录自动覆盖。
- **禁止使用 emoji** — 代码、UI、文档中一律不得使用 emoji 字符。UI 中需要图标时使用 `lucide-react` 图标库（已安装在 `@repo/client` 和 `@repo/game-ui` 中）。日志和文档使用纯文本。
- **PC + 移动端** — 所有页面和游戏必须同时支持 PC 和手机端，开发时缩放浏览器到 375px 宽度验证。
