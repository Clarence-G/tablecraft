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
│   ├── love-letter/            # Love Letter (情书) — card game with hidden info
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
│           ├── board/          # IntersectionBoard, DiscBoard, GridBoard, GridCell
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
│   ├── DESIGN.md               # Visual design language spec
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

所有颜色通过 `packages/client/src/index.css` 中的 CSS 变量统一管理。风格：暖奶油色 skeuomorphic — 奶油白背景、深棕厚边框、硬偏移阴影。

#### 核心 Token

| 变量 | Tailwind class | 用途 |
|------|---------------|------|
| `--background` | `bg-background` | 页面底色（暖奶油 `#faf5eb`） |
| `--card` | `bg-card` | 卡片、面板（纸白 `#ffffff`） |
| `--secondary` / `--muted` | `bg-secondary` / `bg-muted` | 凹陷区域、次要背景 |
| `--foreground` | `text-foreground` | 主文字、厚边框、硬阴影 |
| `--muted-foreground` | `text-muted-foreground` | 次要文字、描述 |
| `--border` | `border-border` | 分隔线、禁用状态 |
| `--primary` | `bg-primary` | 主按钮背景 |
| `--primary-foreground` | `text-primary-foreground` | 主按钮文字 |
| `--destructive` | `text-destructive` | 错误、危险操作 |
| `--success` | `text-success` | 在线状态、成功 |
| `--warning` | `text-warning` / `border-warning` | 当前回合、选中卡片 |

#### 游戏调色板（六种固定颜色）

这六种颜色用于游戏标签、棋子、卡牌等，**直接使用 hex 字面量**（不是 Tailwind 内置色），无需添加到 CSS 变量：

| 名称 | Hex | 浅色 tint | 用途示例 |
|------|-----|-----------|---------|
| Dice Red | `#d94040` | `#fde8e8` | 错误、破坏、玩家0棋子 |
| Royal Blue | `#2563eb` | `#e8f0fe` | 策略标签、高亮 |
| Jade Green | `#16a34a` | `#e8f8ee` | 成功、在线、就绪 |
| Amber Gold | `#d97706` | `#fef3e0` | 当前回合、选中、警告 |
| Crown Purple | `#7c3aed` | `#f0e8fe` | 推理标签 |
| Coral Pink | `#e8556d` | `#fde8ec` | 派对标签 |

固定结构色（布局阴影用）：`#1a1108`（最深墨色）、`#3d2e1e`（深棕）、`#c4b8a8`（浅棕）、`#9c8b78`（灰棕）

#### 卡片/面板标准写法

```tsx
// 标准卡片面板
<div className="bg-card border-2 border-foreground rounded-[12px] shadow-[4px_4px_0px_0px_#3d2e1e]">

// 主按钮
<button className="bg-primary text-primary-foreground border-2 border-[#1a1108] shadow-[4px_4px_0px_0px_#1a1108] rounded-[12px] font-semibold transition-all hover:-translate-y-0.5 active:translate-y-px">
```

#### 禁止 / 允许 — 颜色速查

```
BANNED: bg-gray-*, text-gray-*, bg-red-*, bg-blue-*, bg-green-*, bg-yellow-*
        text-white, bg-black, bg-white (除非是 #ffffff 的语义 token)

ALLOWED: bg-card / bg-muted / bg-secondary / bg-primary / bg-background
         text-foreground / text-muted-foreground / text-warning / text-success
         border-border / border-foreground / border-warning
         bg-[#d94040] / bg-[#d97706] / bg-[#16a34a] / bg-[#2563eb] 等六种调色板色
         bg-[#1a1108] / bg-[#3d2e1e] 等固定结构色
```

#### 游戏专用 Token（棋盘类）

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
| `DiscBoard` | `board/` | 圆形棋子列式投放棋盘（Connect Four 式） | 四子棋及类似游戏 |
| `GridBoard` | `board/` | 格子棋盘（CSS Grid，renderCell 回调） | 战舰、国际象棋等 |
| `GridCell` | `board/` | 单个格子按钮 | 配合 GridBoard |
| `PlayerBadge` | `player/` | 玩家徽章（名字、在线状态、回合指示） | 所有游戏 |
| `GameOverModal` | `feedback/` | 游戏结束弹窗（排名、胜负） | 所有游戏 |

**`DiscBoard` Props（列式投放棋盘）：**

```tsx
import { DiscBoard, PLAYER_DISC_BG } from '@repo/game-ui/board';

<DiscBoard
  rows={6}
  cols={7}
  board={state.board}          // number[], 0=空, 1=玩家0, 2=玩家1
  myPlayerIndex={0}            // 0 或 1，决定 ghost 预览颜色
  canPlay={isMyTurn && !gameOver}
  onColumnClick={(col) => sendAction({ type: 'drop', col })}
  winningCells={new Set([...])} // 可选，高亮获胜格子
/>

// 玩家棋子颜色：PLAYER_DISC_BG[0] = Dice Red, PLAYER_DISC_BG[1] = Amber Gold
```

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

Registering a new game requires changes in **6 places**:
1. `games/server-registry.ts` — add `{ meta, logic }`
2. `games/client-registry.ts` — add `{ meta, Board: lazy(...) }`
3. `packages/client/vite.config.ts` — add `@games/<id>/shared` alias
4. `packages/client/tsconfig.json` — add paths for `shared` and `board`
5. `vitest.workspace.ts` — add vitest config path
6. `package.json` (root) — add `@games/<id>: workspace:*` dependency

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

interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  tags?: string[];              // e.g. ['策略', '棋类']
  icon?: string;                // Lucide icon name, e.g. 'Target', 'Heart'
  estimatedMinutes?: number;    // Estimated play time
  actionThrottleMs?: number;
  configSchema?: z.ZodType;
  defaultConfig?: unknown;
  rules?: string;              // Human-readable rules (Chinese in meta, i18n in zh/en.json)
  agentRules?: string;         // Machine-readable action/view schema for AI agents
}
```

Action results:
- `{ ok: true, state: newState, events: [] }` — accepted, broadcast new views
- `{ ok: false, reason: 'message' }` — rejected, client gets `game:reject`

Engine events in `events[]`:
- `{ type: 'SET_TIMER', name: string, ms: number }` — start a timer
- `{ type: 'CLEAR_TIMER', name: string }` — cancel a timer
- `{ type: 'END_GAME', rankings: string[] }` — end the game with ordered rankings
- `{ type: 'NOTIFY', to: string, payload: unknown }` — send private notification
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

2. **Edit `games/<your-game>/package.json`** — change `name` to `@games/<your-game>`.

3. **Edit `games/<your-game>/shared.ts`** — set `meta` (id, name, description, minPlayers, maxPlayers, tags, icon, estimatedMinutes, rules, agentRules) and define `ActionSchema`.

4. **Edit `games/<your-game>/logic.ts`** — implement `setup`, `onAction`, `getPlayerView`.

5. **Edit `games/<your-game>/Board.tsx`** — implement the React UI.
   - The outer `<div>` must have `data-testid="game-board"`
   - Use Design Token classes (`bg-background`, `text-muted-foreground`, etc.)
   - Use `@repo/game-ui` components (`PlayerBadge`, `GameOverModal`, `IntersectionBoard`, etc.)
   - Use `@/components/ui/*` for buttons, inputs, cards
   - **Must support PC and mobile** — test at 375px width

6. **Register the game:**
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

7. **Add Vite alias** (in `packages/client/vite.config.ts`):
   ```ts
   { find: '@games/<your-game>/shared', replacement: path.resolve(root, 'games/<your-game>/shared.ts') },
   ```
   Note: the generic regex alias `@games/(.+)/board` already handles Board.tsx -- you only need to add the `shared` alias.

8. **Add TypeScript paths** (in `packages/client/tsconfig.json`):
   ```json
   "@games/<your-game>/shared": ["../../games/<your-game>/shared.ts"],
   "@games/<your-game>/board": ["../../games/<your-game>/Board.tsx"]
   ```

9. **Add workspace dependency** (in root `package.json`):
   ```json
   "@games/<your-game>": "workspace:*"
   ```

10. **Add vitest config:**
   ```ts
   // games/<your-game>/vitest.config.ts  (copy from _template, change test name)
   ```
   ```ts
   // vitest.workspace.ts — add the new config path
   ```

11. **Install + write tests:**
   ```bash
   pnpm install
   ```
   Write tests in `logic.test.ts` using `GameTestHarness`.

12. **Verify:**
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

**Acceptable suppressions — use exactly these patterns:**

```ts
// biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are stable positional keys
key={`${r}-${c}`}

// biome-ignore lint/suspicious/noArrayIndexKey: card hand reordered only after actions
key={i}

// biome-ignore lint/suspicious/noArrayIndexKey: fixed positional display (revolver chambers, dice faces)
key={i}
```

`noExplicitAny` in **`*.test.ts` files** is acceptable — `GameTestHarness<any, ...>` and `h.rawState as any` are the standard white-box testing pattern used across all game tests. Do not suppress it; just leave it as a warning.

`noNonNullAssertion` (`!`) must be eliminated from production code. Replace with optional chaining or explicit null checks:

```ts
// Bad
const winner = state.winner!;

// Good
if (state.winner) { /* use state.winner */ }
const winner = state.winner ?? '';
```

---

## 11. Common Pitfalls

- **硬编码颜色** — 最常见错误。禁止使用 `bg-gray-*`, `text-yellow-*`, `bg-green-*` 等 Tailwind 内置色类。必须用 token（`bg-card`, `text-foreground`）或 Section 5.1 列出的六种调色板 hex。
- **Design Token** — 参见 Section 5.1 的"禁止/允许速查"。使用前先确认 token 存在于 `index.css`。

- **`getSnapshot` must return stable references** — do not create a new object on every call in `useSyncExternalStore`.
- **Biome-ignore comments must go on the line directly before the flagged code**, not inside a block.
- **All `<button>` elements need `type="button"`** (Biome `useButtonType` rule).
- **`<div onClick>` needs a keyboard handler** — use `<button>` instead (Biome `useKeyWithClickEvents`).
- **`for...of` instead of `.forEach()`** (Biome `noForEach`).
- **`node:path` not `path`** (Biome `useNodejsImportProtocol`).
- **Client `tsconfig.json` includes `../../games`** — if you add a new game, ensure its transpile path is covered by `paths` aliases.
- **`@source` in index.css** — `games/` 目录通过 `@source "../../../games"` 被 Tailwind 扫描，新游戏目录自动覆盖。
- **禁止使用 emoji** — 代码、UI、文档中一律不得使用 emoji 字符。UI 中需要图标时使用 `lucide-react` 图标库（已安装在 `@repo/client` 和 `@repo/game-ui` 中）。日志和文档使用纯文本。
- **PC + 移动端** — 所有页面和游戏必须同时支持 PC 和手机端，开发时缩放浏览器到 375px 宽度验证。

---

## CLI & REST API for Agents

TableCraft exposes a REST API and CLI tool for AI agents to play games programmatically.

### Generating a Bot Token

```bash
# Server must be running (pnpm dev)
curl -s -X POST http://localhost:3001/api/admin/token \
  -H 'Content-Type: application/json' \
  -d '{"name":"TestBot"}'
# Returns: { "ok": true, "data": { "token": "...", "userId": "bot_..." } }
```

### Running the CLI

```bash
# Set credentials via environment variables
export TABLECRAFT_SERVER="http://localhost:3001"
export TABLECRAFT_TOKEN="<token-from-above>"

# Or persist to ~/.tablecraft/config.json
tsx packages/cli/src/index.ts login --server http://localhost:3001 --token <token>
```

### Quick Test

```bash
CLI="tsx packages/cli/src/index.ts"

# List games
$CLI games list

# Read gomoku rules (agent-friendly)
$CLI games rules gomoku

# Create a room, join with a second bot, start, and play
$CLI rooms create gomoku
$CLI game state <roomId>
$CLI game action <roomId> '{"type":"place","row":7,"col":7}'
$CLI game wait <roomId> --after <seq>
```

### REST API Endpoints

All under `/api/*`. Auth via `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/admin/token | Generate bot token |
| POST | /api/auth/login | Verify identity |
| GET | /api/games | List all game types |
| GET | /api/games/:gameId | Game detail + agentRules |
| GET | /api/rooms | List joinable rooms |
| POST | /api/rooms | Create room |
| GET | /api/rooms/:id | Room state |
| POST | /api/rooms/:id/join | Join room (bot auto-ready) |
| POST | /api/rooms/:id/leave | Leave room |
| POST | /api/rooms/:id/start | Start game (host only) |
| GET | /api/rooms/:id/state | Current PlayerView |
| POST | /api/rooms/:id/action | Submit action |
| GET | /api/rooms/:id/wait | Long-poll for state changes |

### Writing agentRules for New Games

Every new game should include `agentRules` in its `meta` export. This is a machine-readable string that tells agents:
- The exact JSON shape of actions
- What each PlayerView field means
- Win/loss conditions
- What moves are illegal

See `games/gomoku/shared.ts` for a complete example.
