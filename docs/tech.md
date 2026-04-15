# 桌游平台技术方案 v1.2

---

## 一、项目概述

构建一个通用桌游平台，通过引擎 + 插件架构支持多种游戏类型。每个新游戏只需 AI 生成 **4 个文件**即可上线。

### 核心设计原则

| 原则 | 说明 |
|---|---|
| **AI 友好** | 每个游戏只有 4 个文件，Prompt 模板自包含所有上下文，AI 无需翻阅引擎源码 |
| **逻辑自包含** | 游戏的 `shared.ts` + `logic.ts` 包含全部规则，不依赖散落的外部文件 |
| **可测试** | 纯函数逻辑 → Vitest 单元测试；完整 UI 流程 → Playwright E2E 测试 |
| **信息安全** | 服务端持有完整状态，客户端只看到 `getPlayerView` 过滤后的视角 |

### 覆盖游戏类型

| 类型 | 代表 | 特征 |
|---|---|---|
| 卡牌 | UNO、斗地主、德州扑克 | 手牌隐藏、出牌规则、牌堆管理 |
| 麻将 | 国标麻将 | 复杂轮次、吃碰杠抢、同时响应窗口 |
| 棋类 | 五子棋、象棋、围棋 | 网格棋盘、回合严格交替 |
| 派对 | 狼人杀 | 多阶段、角色隐藏、投票、发言、定时器 |
| 骰子 | 大话骰 | 掷骰、押注、宣言与质疑 |

---

## 二、技术栈

| 层 | 选型 | 版本 | 理由 |
|---|---|---|---|
| **Monorepo** | pnpm workspaces | - | 零额外工具 |
| **语言** | TypeScript | 5.x | 全栈统一 |
| **服务端运行时** | Node.js | 20 LTS | - |
| **HTTP 框架** | Express | 4.x | AI 最熟悉 |
| **实时通信** | Socket.IO | 4.x | 自带重连、房间、回退 |
| **客户端框架** | React | 18.x | - |
| **构建工具** | Vite | 5.x | TS 零配置，天然支持 workspace TS 导入 |
| **样式** | Tailwind CSS | 3.x | 原子化，游戏间零污染 |
| **通用 UI** | shadcn/ui | - | 大厅/房间等非游戏界面 |
| **拖拽** | @dnd-kit/core | - | 棋子拖放、出牌拖放 |
| **动画** | Framer Motion | 11.x | 卡牌飞行、棋子滑动 |
| **数据库** | SQLite | - | 零配置单文件 |
| **ORM** | Drizzle | - | 类型安全，轻量 |
| **校验** | Zod | 3.x | 动作校验 + 类型推导 |
| **ID 生成** | nanoid | - | 房间码、匿名用户 ID |
| **种子随机** | seedrandom | - | 可复现随机序列 |
| **音频** | Howler.js | 2.x | 跨浏览器音效 |
| **单元测试** | Vitest | - | 与 Vite 同生态 |
| **E2E 测试** | Playwright | - | 多浏览器并行、多 context 模拟多玩家 |

---

## 三、Monorepo 包结构

```
tabletop/
├── package.json
├── pnpm-workspace.yaml          # packages: ['packages/*', 'games/*']
├── tsconfig.base.json
├── playwright.config.ts         # E2E 测试配置
│
├── packages/
│   ├── shared/                  # @repo/shared ── 类型 + 工具 + 测试基建
│   │   ├── types/
│   │   │   ├── engine.ts        # GameLogic, GameMeta, EngineEvent, ActionResult
│   │   │   ├── room.ts          # RoomState, PlayerInfo
│   │   │   ├── socket.ts        # ClientEvents, ServerEvents
│   │   │   ├── board.ts         # BoardProps
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   └── pending-phase.ts # PendingPhase + collectResponse + fillDefaults
│   │   ├── testing/
│   │   │   ├── game-harness.ts  # GameTestHarness 测试夹具
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── server/                  # @repo/server ── 引擎 + API
│   │   ├── engine/
│   │   │   ├── GameRoom.ts
│   │   │   ├── RoomManager.ts
│   │   │   ├── ActionPipeline.ts
│   │   │   ├── TimerManager.ts
│   │   │   └── RandomProvider.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── migrate.ts
│   │   │   └── index.ts
│   │   ├── socket/
│   │   │   ├── handlers.ts
│   │   │   └── auth.ts
│   │   ├── __tests__/
│   │   │   ├── action-pipeline.test.ts
│   │   │   ├── room-manager.test.ts
│   │   │   └── game-room.test.ts
│   │   ├── index.ts
│   │   └── package.json
│   │
│   ├── client/                  # @repo/client ── 前端应用
│   │   ├── src/
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts
│   │   │   │   ├── useGame.ts
│   │   │   │   ├── useRoom.ts
│   │   │   │   ├── useSound.ts
│   │   │   │   └── useIdentity.ts
│   │   │   ├── pages/
│   │   │   │   ├── Lobby.tsx
│   │   │   │   ├── Room.tsx
│   │   │   │   └── Game.tsx
│   │   │   ├── components/
│   │   │   │   ├── Layout.tsx
│   │   │   │   ├── ErrorToast.tsx
│   │   │   │   └── Loading.tsx
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── package.json
│   │
│   ├── game-ui/                 # @repo/game-ui ── 预制交互组件
│   │   ├── card/
│   │   │   ├── PlayingCard.tsx
│   │   │   ├── CardHand.tsx
│   │   │   ├── CardDeck.tsx
│   │   │   └── CardPile.tsx
│   │   ├── board/
│   │   │   ├── GridBoard.tsx
│   │   │   └── GridCell.tsx
│   │   ├── dice/
│   │   │   └── Dice.tsx
│   │   ├── player/
│   │   │   ├── PlayerBadge.tsx
│   │   │   ├── PlayerList.tsx
│   │   │   └── TurnIndicator.tsx
│   │   ├── feedback/
│   │   │   ├── GameTimer.tsx
│   │   │   ├── ScoreBoard.tsx
│   │   │   └── GameOverModal.tsx
│   │   └── package.json
│   │
│   ├── game-assets/             # @repo/game-assets ── 视觉 + 音频素材
│   │   ├── cards/
│   │   │   ├── poker/           # 54 张扑克 SVG
│   │   │   ├── uno/             # UNO 牌面 SVG
│   │   │   ├── mahjong/         # 144 张麻将 SVG
│   │   │   └── card-back.svg
│   │   ├── pieces/
│   │   │   ├── chess-chinese/
│   │   │   ├── chess-intl/
│   │   │   └── stones/
│   │   ├── dice/
│   │   │   └── d6/
│   │   ├── sounds/
│   │   │   ├── card-play.mp3
│   │   │   ├── card-deal.mp3
│   │   │   ├── piece-drop.mp3
│   │   │   ├── dice-roll.mp3
│   │   │   ├── turn-notify.mp3
│   │   │   ├── timer-tick.mp3
│   │   │   ├── win.mp3
│   │   │   └── lose.mp3
│   │   ├── textures/
│   │   │   └── table-green.png
│   │   └── package.json
│   │
│   └── game-animate/            # @repo/game-animate ── 动画原语
│       ├── useCardDeal.ts
│       ├── useCardPlay.ts
│       ├── useCardFlip.ts
│       ├── usePieceMove.ts
│       ├── useDiceRoll.ts
│       ├── useScorePop.ts
│       ├── AnimatePresenceGroup.tsx
│       └── package.json
│
├── games/                       # ⭐ 游戏插件目录
│   ├── _template/               # AI 生成模板（第十二章完整给出）
│   │   ├── package.json
│   │   ├── shared.ts
│   │   ├── logic.ts
│   │   ├── logic.test.ts
│   │   └── Board.tsx
│   ├── server-registry.ts       # 服务端注册表
│   ├── client-registry.ts       # 客户端注册表
│   ├── uno/                     # @games/uno
│   ├── gomoku/                  # @games/gomoku
│   └── werewolf/                # @games/werewolf
│
└── tests/                       # E2E + 集成测试
    └── e2e/
        ├── helpers/
        │   ├── multi-player.ts  # 多玩家浏览器 helper
        │   └── wait-for.ts      # 等待状态变更 helper
        ├── lobby.spec.ts
        ├── room-flow.spec.ts
        ├── uno.spec.ts
        ├── gomoku.spec.ts
        └── werewolf.spec.ts
```

### 每个游戏只有 4 个文件

```
games/uno/                  # @games/uno
├── package.json            # 标准模板，只改 name
├── shared.ts               # 元信息 + Zod schema + View/Action 类型
├── logic.ts                # 完整游戏逻辑（TState 定义在此，不暴露）
├── logic.test.ts           # 单元测试（使用 GameTestHarness）
└── Board.tsx               # React UI 组件
```

```json
// games/uno/package.json
{
  "name": "@games/uno",
  "private": true,
  "exports": {
    "./shared": "./shared.ts",
    "./logic": "./logic.ts",
    "./board": "./Board.tsx"
  },
  "dependencies": {
    "@repo/shared": "workspace:*",
    "@repo/game-ui": "workspace:*",
    "@repo/game-assets": "workspace:*",
    "@repo/game-animate": "workspace:*"
  }
}
```

**导入隔离规则：**

- `@repo/server` 只导入 `@games/xxx/logic` 和 `@games/xxx/shared` → 永远不会碰 `Board.tsx`
- `@repo/client` 只导入 `@games/xxx/board` 和 `@games/xxx/shared` → 永远不会碰 `logic.ts`
- Vite / Node 的模块解析自然遵守 `exports` 字段，无需额外配置

### 双注册表

```ts
// ========= games/server-registry.ts =========
// 仅被 @repo/server 导入

import { meta as unoMeta } from '@games/uno/shared'
import { logic as unoLogic } from '@games/uno/logic'

import { meta as gomokuMeta } from '@games/gomoku/shared'
import { logic as gomokuLogic } from '@games/gomoku/logic'

// 新增游戏加两行 import + 一行注册

import type { ServerGamePlugin } from '@repo/shared'

export const serverRegistry: Record<string, ServerGamePlugin> = {
  [unoMeta.id]:    { meta: unoMeta,    logic: unoLogic },
  [gomokuMeta.id]: { meta: gomokuMeta, logic: gomokuLogic },
}
```

```tsx
// ========= games/client-registry.ts =========
// 仅被 @repo/client 导入

import { lazy } from 'react'
import { meta as unoMeta } from '@games/uno/shared'
import { meta as gomokuMeta } from '@games/gomoku/shared'

import type { ClientGamePlugin } from '@repo/shared'

// React.lazy → 按需加载，不会把所有游戏 Board 打入主 bundle
export const clientRegistry: Record<string, ClientGamePlugin> = {
  [unoMeta.id]: {
    meta: unoMeta,
    Board: lazy(() => import('@games/uno/board').then(m => ({ default: m.Board }))),
  },
  [gomokuMeta.id]: {
    meta: gomokuMeta,
    Board: lazy(() => import('@games/gomoku/board').then(m => ({ default: m.Board }))),
  },
}
```

### pnpm workspace 配置

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'games/*'
```

---

## 四、核心类型契约

> 以下是 `@repo/shared` 的完整类型定义。AI Prompt 模板会内联这些类型，AI 不需要翻阅此文件。

### 4.1 engine.ts

```ts
// packages/shared/types/engine.ts

import { z } from 'zod'

/** 游戏元信息 */
export interface GameMeta {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  tags?: string[]                   // 'card' | 'board' | 'party' | 'dice'
  actionThrottleMs?: number         // 覆盖默认 100ms 节流
  configSchema?: z.ZodType          // 房间创建时可选配置
  defaultConfig?: unknown           // 不传时的默认值
}


/** 引擎提供给游戏逻辑的上下文 */
export interface GameContext {
  players: string[]                 // playerID 列表，顺序即座位
  random: SeededRandom
}

export interface SeededRandom {
  shuffle<T>(arr: T[]): T[]
  int(min: number, max: number): number
  float(): number
  seed: string
}


/** 引擎事件：游戏逻辑通过返回这些来控制引擎行为 */
export type EngineEvent =
  | { type: 'SET_TIMER'; name: string; ms: number }
  | { type: 'CLEAR_TIMER'; name: string }
  | { type: 'NOTIFY'; to: string; payload: unknown }
  | { type: 'NOTIFY_ALL'; payload: unknown }
  | { type: 'END_GAME'; rankings: string[] }
  // 注意：REJECT 不是引擎事件，而是 ActionResult 的 ok:false 分支


/** onAction / onTimer 的返回值 */
export type ActionResult<S> =
  | { ok: true;  state: S; events?: EngineEvent[] }
  | { ok: false; reason: string }


/** AI 实现此接口 */
export interface GameLogic<
  TState = any,
  TAction = any,
  TView = any,
> {
  /** Zod schema，引擎用来校验客户端发来的动作 */
  actions: z.ZodType<TAction>

  /** 初始化游戏状态。config 来自房间配置（可选） */
  setup(ctx: GameContext, config?: unknown): TState

  /** 核心：处理一个动作 */
  onAction(
    state: TState,
    action: TAction,
    playerID: string,
    ctx: GameContext,
  ): ActionResult<TState>

  /** 每个玩家看到的视角（信息隔离） */
  getPlayerView(state: TState, playerID: string): TView

  /** 观众视角（未实现则不支持观战） */
  getSpectatorView?(state: TState): TView

  /** 定时器到期回调（可选） */
  onTimer?(
    state: TState,
    timerName: string,
    ctx: GameContext,
  ): ActionResult<TState>

  /** 玩家断线时的处理（可选，默认引擎跳过该玩家） */
  onPlayerDisconnect?(
    state: TState,
    playerID: string,
    ctx: GameContext,
  ): ActionResult<TState>
}


/** 服务端注册表条目 */
export interface ServerGamePlugin {
  meta: GameMeta
  logic: GameLogic
}

/** 客户端注册表条目 */
export interface ClientGamePlugin {
  meta: Pick<GameMeta, 'id' | 'name' | 'description' | 'minPlayers' | 'maxPlayers' | 'tags'>
  Board: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>
}
```

### 4.2 board.ts

```ts
// packages/shared/types/board.ts

import type { PlayerInfo } from './room'

/** Board 组件 Props —— 泛型化，sendAction 有类型提示 */
export interface BoardProps<TView, TAction = unknown> {
  /** 当前玩家看到的游戏视角 */
  state: TView
  /** 当前玩家 ID */
  myId: string
  /** 所有玩家信息 */
  players: PlayerInfo[]
  /** 发送动作到服务端（有类型提示） */
  sendAction: (action: TAction) => void
  /** 最近一次操作被拒绝的原因（3秒后自动清空） */
  lastReject: string | null
  /** 收到的 game:notify 队列 */
  notifications: unknown[]
}
```

### 4.3 room.ts

```ts
// packages/shared/types/room.ts

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface PlayerInfo {
  id: string
  name: string
  ready: boolean
  connected: boolean
  seatIndex: number
  // 注意：是否被淘汰等游戏特定状态由 getPlayerView 返回的 TView 处理
}

export interface RoomState {
  roomId: string
  gameId: string
  status: RoomStatus
  hostId: string
  players: PlayerInfo[]
  maxPlayers: number              // 从 GameMeta 带入
  config?: unknown                // 游戏变体配置
  createdAt: number
}
```

### 4.4 socket.ts

```ts
// packages/shared/types/socket.ts

import type { RoomState } from './room'

/** 通用 ack 回调结果 */
export type Ack<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** 客户端 → 服务端 */
export interface ClientEvents {
  'room:create': (
    gameId: string,
    playerName: string,
    config: unknown | undefined,     // 可选游戏配置
    ack: (result: Ack<{ roomId: string }>) => void,
  ) => void

  'room:join': (
    roomId: string,
    playerName: string,
    ack: (result: Ack) => void,
  ) => void

  'room:leave': () => void
  'room:ready': () => void

  'room:start': (
    ack: (result: Ack) => void,
  ) => void

  'room:kick': (playerId: string) => void

  'game:action': (
    action: unknown,
    seq: number,                     // 客户端递增序列号，用于去重
  ) => void
}

/** 服务端 → 客户端 */
export interface ServerEvents {
  'room:state': (room: RoomState) => void
  'game:state': (view: unknown) => void
  'game:reject': (reason: string) => void
  'game:notify': (payload: unknown) => void
  'game:end': (rankings: string[]) => void
  'error': (message: string) => void
}
```

---

## 五、引擎核心设计

### 5.1 动作处理管线

```
客户端 sendAction(action, seq)
    │
    ▼
①  Socket.IO handler 收到
    │  playerID 从 socket.data.userId 取（认证中间件写入），
    │  绝不从客户端 payload 读取
    │
    ▼
②  节流检查（同一玩家 N ms 内只允许 1 次 action）
    │  N = GameMeta.actionThrottleMs ?? 100
    │  超频 → emit('game:reject', 'Too fast')，return
    │
    ▼
③  去重检查（seq ≤ lastSeq[playerID]）
    │  重复 → 静默忽略，return
    │
    ▼
④  Zod 校验（logic.actions.safeParse）
    │  失败 → emit('game:reject', parseError.message)，return
    │
    ▼
⑤  try-catch 调用 logic.onAction(state, action, playerID, ctx)
    │  异常 → logger.error(...); emit('game:reject', 'Internal error')，return
    │
    ▼
⑥  检查 ActionResult
    │
    ├─ { ok: false, reason }
    │    不更新状态，不广播 view
    │    emit('game:reject', reason) 给操作者
    │    return
    │
    └─ { ok: true, state, events }
         │
         ▼
⑦  处理 events[]
    ├─ SET_TIMER    → TimerManager.set(name, ms, callback)
    ├─ CLEAR_TIMER  → TimerManager.clear(name)
    ├─ NOTIFY       → 向指定玩家 emit('game:notify', payload)
    ├─ NOTIFY_ALL   → 向所有玩家 emit('game:notify', payload)
    └─ END_GAME     → 标记 finished + emit('game:end', rankings)
         │
         ▼
⑧  广播视角：对每个在线玩家
    view = logic.getPlayerView(newState, playerID)
    emit('game:state', view)
         │
         ▼
⑨  持久化：state 快照 + action 日志写入 SQLite
```

### 5.2 GameRoom 类

```ts
class GameRoom {
  // --- 标识 ---
  roomId: string
  gameId: string
  status: RoomStatus            // 'waiting' | 'playing' | 'finished'

  // --- 玩家 ---
  players: Map<string, PlayerInfo>

  // --- 游戏 ---
  state: unknown                // 游戏完整状态（只在 playing 时有值）
  config: unknown               // 游戏变体配置
  logic: GameLogic              // 从注册表获取
  ctx: GameContext              // players + random

  // --- 引擎基础设施 ---
  timerManager: TimerManager
  lastSeq: Map<string, number>          // 每玩家最后处理的 seq
  lastActionTime: Map<string, number>   // 每玩家最后 action 时间戳
  finishedAt: number | null             // 用于清理计时
  lastActivityAt: number                // 用于清理计时

  // --- 房间生命周期 ---
  join(playerID: string, name: string): Ack
  leave(playerID: string): void
  ready(playerID: string): void
  start(): Ack                  // 校验人数、全部 ready、config 合法

  // --- 游戏 ---
  handleAction(playerID: string, rawAction: unknown, seq: number): void
  handleTimer(timerName: string): void

  // --- 断线重连 ---
  markDisconnected(playerID: string): void
  markReconnected(playerID: string): void

  // --- 再来一局 ---
  restart(): void              // finished → waiting，清除状态，保留玩家

  // --- 序列化 ---
  serialize(): object          // 用于持久化到 SQLite
  static deserialize(row: object, logic: GameLogic): GameRoom
}
```

### 5.3 RoomManager

```ts
class RoomManager {
  private rooms: Map<string, GameRoom>
  private userToRoom: Map<string, string>    // userId → roomId 反向索引
  private cleanupTimer: NodeJS.Timer

  constructor() {
    // 每 60 秒清理一次
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)
  }

  // --- 基础操作 ---
  createRoom(gameId: string, hostId: string, config?: unknown): GameRoom
  getRoom(roomId: string): GameRoom | undefined
  findRoomByUser(userId: string): GameRoom | undefined  // 用反向索引 O(1)
  removeRoom(roomId: string): void

  // --- 加入/离开时维护反向索引 ---
  onPlayerJoin(roomId: string, userId: string): void {
    this.userToRoom.set(userId, roomId)
  }
  onPlayerLeave(userId: string): void {
    this.userToRoom.delete(userId)
  }

  // --- 清理策略 ---
  private cleanup(): void {
    const now = Date.now()
    for (const [id, room] of this.rooms) {
      // 已结束：5 分钟后移除
      if (room.status === 'finished'
        && room.finishedAt
        && now - room.finishedAt > 5 * 60_000
      ) {
        this.removeRoom(id)
        continue
      }
      // 等待中但无人在线：10 分钟后销毁
      if (room.status === 'waiting'
        && this.allDisconnected(room)
        && now - room.lastActivityAt > 10 * 60_000
      ) {
        this.removeRoom(id)
        continue
      }
    }
  }

  // --- 重启恢复 ---
  async restoreFromDB(db: Database, registry: ServerRegistry): Promise<void> {
    // 只恢复 status = 'playing' 的房间
    const rows = await db.select().from(rooms).where(eq(rooms.status, 'playing'))
    for (const row of rows) {
      const logic = registry[row.gameId]?.logic
      if (!logic) continue
      const room = GameRoom.deserialize(row, logic)
      this.rooms.set(row.id, room)
      // 恢复反向索引
      for (const [pid] of room.players) {
        this.userToRoom.set(pid, row.id)
      }
    }
  }
}
```

### 5.4 认证中间件

```ts
// packages/server/socket/auth.ts
io.use((socket, next) => {
  const userId = socket.handshake.auth.userId
  const userName = socket.handshake.auth.userName

  if (!userId || typeof userId !== 'string') {
    return next(new Error('Missing userId'))
  }

  // 将身份写入 socket.data，后续所有操作从此处取
  socket.data.userId = userId
  socket.data.userName = userName
  next()
})
```

### 5.5 自动重进房间

```ts
// 连接成功后（auth 中间件之后）
io.on('connection', (socket) => {
  const userId = socket.data.userId

  // 检查该用户是否在某个房间中
  const room = roomManager.findRoomByUser(userId)
  if (room) {
    room.markReconnected(userId)
    socket.join(room.roomId)
    socket.emit('room:state', room.toRoomState())
    if (room.status === 'playing') {
      const view = room.logic.getPlayerView(room.state, userId)
      socket.emit('game:state', view)
    }
  }
})
```

### 5.6 Config 校验

```ts
// 在 room:create handler 中
socket.on('room:create', (gameId, playerName, config, ack) => {
  const plugin = serverRegistry[gameId]
  if (!plugin) return ack({ ok: false, error: 'Unknown game' })

  // 校验 config
  let validatedConfig = plugin.meta.defaultConfig
  if (plugin.meta.configSchema && config !== undefined) {
    const result = plugin.meta.configSchema.safeParse(config)
    if (!result.success) {
      return ack({ ok: false, error: `Invalid config: ${result.error.message}` })
    }
    validatedConfig = result.data
  }

  const room = roomManager.createRoom(gameId, socket.data.userId, validatedConfig)
  room.join(socket.data.userId, playerName)
  roomManager.onPlayerJoin(room.roomId, socket.data.userId)
  socket.join(room.roomId)
  ack({ ok: true, data: { roomId: room.roomId } })
  io.to(room.roomId).emit('room:state', room.toRoomState())
})
```

### 5.7 "再来一局"流程

```
状态转移：finished → waiting

触发：任意玩家发送 'room:restart'
服务端处理：
  1. 将房间 status 重置为 'waiting'
  2. 保留玩家列表，清除所有 ready 状态
  3. 清除旧 state，seed 将在下次 start 时重新生成
  4. 清除所有 timer
  5. 广播 room:state（status=waiting）
  6. 客户端检测到 status 变化 → 自动跳回 Room 页面
  7. 正常走 ready → start 流程
```

在 socket.ts 类型中追加：

```ts
// ClientEvents 追加
'room:restart': () => void
```

### 5.8 RandomProvider

```ts
import seedrandom from 'seedrandom'

class RandomProvider implements SeededRandom {
  private rng: () => number
  readonly seed: string

  constructor(seed: string) {
    this.seed = seed
    this.rng = seedrandom(seed)
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1))
  }

  float(): number {
    return this.rng()
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
}
```

### 5.9 TimerManager

```ts
class TimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map()

  set(name: string, ms: number, callback: () => void): void {
    this.clear(name)
    this.timers.set(name, setTimeout(() => {
      this.timers.delete(name)
      callback()
    }, ms))
  }

  clear(name: string): void {
    const timer = this.timers.get(name)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(name)
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
```

### 5.10 性能备注

```
V1 实现：每次 ok:true 的 action 后对所有在线玩家调用 getPlayerView + emit。

V2 优化方向（此处记录，V1 不实施）：
  - 引用相等检测：if (newView === cachedView[playerID]) 跳过 emit
  - 观众合并：所有观众共享一份 spectatorView，只序列化一次
  - diff 推送：JSON patch 减少传输量
  - 压缩：Socket.IO perMessageDeflate（大状态有效）
```

---

## 六、并发 / 同时行动模式

### 6.1 设计思路

引擎的 `onAction` 始终**线性处理单个动作**。收集多人同时响应的逻辑由游戏`logic.ts` 自行管理——在 state 中维护 `PendingPhase`。

引擎提供**不可变的工具函数**（位于 `@repo/shared/utils/pending-phase.ts`），AI 直接 import 使用。

### 6.2 工具函数

```ts
// packages/shared/utils/pending-phase.ts

/** 并发响应阶段的数据结构 */
export interface PendingPhase<TResponse> {
  /** 需要响应的玩家列表 */
  expectedPlayers: string[]
  /** 已收到的响应 */
  responses: Record<string, TResponse>
  /** 超时定时器名称 */
  timerName: string
}

/** 创建一个新的 PendingPhase */
export function createPendingPhase<T>(
  expectedPlayers: string[],
  timerName: string,
): PendingPhase<T> {
  return {
    expectedPlayers,
    responses: {},
    timerName,
  }
}

/**
 * 纯函数：收集一个玩家的响应，返回新的 PendingPhase 和是否全部完成。
 * 不会修改原对象。
 */
export function collectResponse<T>(
  pending: PendingPhase<T>,
  playerID: string,
  response: T,
): { pending: PendingPhase<T>; allDone: boolean } {
  // 不在预期列表中
  if (!pending.expectedPlayers.includes(playerID)) {
    return { pending, allDone: false }
  }
  // 已经响应过
  if (pending.responses[playerID] !== undefined) {
    return { pending, allDone: false }
  }
  // 创建新对象（不可变）
  const newResponses = { ...pending.responses, [playerID]: response }
  const updated: PendingPhase<T> = { ...pending, responses: newResponses }
  const allDone = Object.keys(newResponses).length === pending.expectedPlayers.length
  return { pending: updated, allDone }
}

/**
 * 纯函数：为未响应的玩家填入默认值，返回完整响应记录。
 * 用于超时处理。
 */
export function fillDefaults<T>(
  pending: PendingPhase<T>,
  defaultResponse: T,
): Record<string, T> {
  const filled = { ...pending.responses }
  for (const pid of pending.expectedPlayers) {
    if (filled[pid] === undefined) {
      filled[pid] = defaultResponse
    }
  }
  return filled
}
```

### 6.3 使用示例：麻将抢牌窗口

```ts
import { PendingPhase, createPendingPhase, collectResponse, fillDefaults } from '@repo/shared/utils/pending-phase'

interface MahjongState {
  phase: 'playing' | 'waiting_claims'
  claimWindow: PendingPhase<Claim> | null
  // ...
}

type Claim =
  | { type: 'chi'; tiles: [string, string] }
  | { type: 'peng' }
  | { type: 'gang' }
  | { type: 'hu' }
  | { type: 'pass' }

// 某玩家出牌后 → 进入抢牌窗口
function enterClaimWindow(state: MahjongState, eligible: string[]): ActionResult<MahjongState> {
  return {
    ok: true,
    state: {
      ...state,
      phase: 'waiting_claims',
      claimWindow: createPendingPhase<Claim>(eligible, 'claim_deadline'),
    },
    events: [{ type: 'SET_TIMER', name: 'claim_deadline', ms: 10_000 }],
  }
}

// onAction：收到某位玩家的抢牌声明
onAction(state, action, playerID, ctx) {
  if (state.phase === 'waiting_claims' && action.type === 'CLAIM') {
    const { pending: updatedWindow, allDone } =
      collectResponse(state.claimWindow!, playerID, action.claim)

    const newState = { ...state, claimWindow: updatedWindow }

    if (allDone) {
      return resolveClaims(newState)                     // 结算 + CLEAR_TIMER
    }
    return { ok: true, state: newState, events: [] }     // 继续等
  }
}

// onTimer：超时自动 pass
onTimer(state, timerName, ctx) {
  if (timerName === 'claim_deadline' && state.claimWindow) {
    const allClaims = fillDefaults(state.claimWindow, { type: 'pass' })
    return resolveClaims({
      ...state,
      claimWindow: { ...state.claimWindow, responses: allClaims },
    })
  }
}
```

### 6.4 使用示例：狼人杀夜间同时行动

```ts
interface WerewolfState {
  phase: 'night_wolf' | 'night_seer' | 'day_discuss' | 'day_vote' | ...
  nightActions: PendingPhase<NightAction> | null
  // ...
}

function enterWolfNight(state: WerewolfState): ActionResult<WerewolfState> {
  const wolves = getAliveWolves(state)
  return {
    ok: true,
    state: {
      ...state,
      phase: 'night_wolf',
      nightActions: createPendingPhase(wolves, 'wolf_night_timeout'),
    },
    events: [{ type: 'SET_TIMER', name: 'wolf_night_timeout', ms: 30_000 }],
  }
}
```

### 6.5 重要注意事项

**onTimer 中的 phase 保护：** 极端情况下，最后一个玩家的响应和 timer 几乎同时到达。虽然 Node.js 单线程不会真正并发，但 `onTimer` 内应先检查当前 phase 是否仍在等待状态：

```ts
onTimer(state, timerName, ctx) {
  if (timerName === 'claim_deadline') {
    // 保护：可能已经在 onAction 中提前结算了
    if (state.phase !== 'waiting_claims' || !state.claimWindow) {
      return { ok: true, state, events: [] }  // 什么都不做
    }
    // ... 正常处理
  }
}
```

---

## 七、数据库设计

```sql
-- 启用 WAL 模式
PRAGMA journal_mode = WAL;

-- 用户（匿名）
CREATE TABLE users (
  id         TEXT PRIMARY KEY,         -- nanoid
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 房间
CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,        -- 6位短码
  game_id     TEXT NOT NULL,
  status      TEXT NOT NULL,           -- waiting | playing | finished
  host_id     TEXT NOT NULL,
  config_json TEXT,                    -- 游戏变体配置 JSON
  seed        TEXT,                    -- 随机数种子
  state_json  TEXT,                    -- 序列化的完整 state
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  finished_at INTEGER                  -- 用于清理计时
);

-- 房间玩家
CREATE TABLE room_players (
  room_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  seat_index INTEGER NOT NULL,
  ready      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);

-- 动作日志（回放 + 调试）
CREATE TABLE action_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,         -- 客户端序列号
  action_json TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  UNIQUE (room_id, user_id, seq)        -- 防重放
);

-- 索引
CREATE INDEX idx_action_room ON action_log(room_id);
CREATE INDEX idx_rooms_status ON rooms(status);
```

---

## 八、客户端架构

### 8.1 页面路由

```
/                   → Lobby（游戏列表 + 创建 / 输入房间码加入）
/room/:roomId       → Room（等待 + 准备）
/room/:roomId/play  → Game（游戏进行中）
```

### 8.2 Lobby 策略

```
V1：不展示公开房间列表。

进入方式：
  - 选择游戏 → 创建房间 → 获得 6 位房间码 → 分享给朋友
  - 输入房间码 → 加入

原因：V1 无账号系统，无匹配需求。公开列表的安全性需额外处理，V2 再考虑。
```

### 8.3 页面刷新恢复流程

```
用户刷新 /room/ABC123/play
    │
    ▼
① App 初始化 → useIdentity 从 localStorage 读 { userId, userName }
    │
    ▼
② useSocket 建立连接，握手携带 auth: { userId, userName }
    │
    ▼
③ 服务端 auth 中间件识别 userId
   → findRoomByUser(userId)
    │
    ├─ 找到房间 → 自动 rejoin
    │   ├─ 推送 'room:state'
    │   └─ status === 'playing' → 推送 'game:state'
    │
    └─ 未找到 → 不推送
    │
    ▼
④ 客户端路由守卫
    │
    ├─ /room/:roomId/play 页面等待 'game:state'
    │   ├─ 3秒内收到 → 正常渲染
    │   └─ 超时 → 重定向到 /
    │
    └─ /room/:roomId 页面等待 'room:state'
        ├─ 收到 → 正常渲染
        └─ 超时 → 重定向到 /
```

### 8.4 核心 Hooks

```ts
// === useIdentity ===
// localStorage 持久化 { userId: nanoid(), userName: randomAnimal() }
// 返回 { userId, userName, rename(newName) }

// === useSocket ===
// Socket.IO 连接管理，auth 携带 identity
// 自动重连（Socket.IO 内置）
// 返回 { socket, connected }

// === useRoom ===
// 监听 'room:state'
// create/join/start 使用 ack 回调获取结果
// 返回 { room, create(), join(), leave(), ready(), start(), kick(), restart() }

// === useGame ===
// 监听 'game:state', 'game:reject', 'game:notify'
// 内部维护递增 seq
// 基于 useSyncExternalStore（见 8.5）
// 返回 { state, sendAction(), lastReject, notifications }

// === useSound ===
// 预加载 Howler 实例
// 返回 { play(soundName) }
```

### 8.5 useGame 详细实现

```ts
// 使用 useSyncExternalStore 避免 Board 全树 re-render

class GameStore {
  private _state: unknown = null
  private _lastReject: string | null = null
  private _notifications: unknown[] = []
  private listeners = new Set<() => void>()
  private seq = 0
  private rejectTimer: ReturnType<typeof setTimeout> | null = null
  private socket: Socket

  constructor(socket: Socket) {
    this.socket = socket

    socket.on('game:state', (view: unknown) => {
      this._state = view
      this.emit()
    })

    socket.on('game:reject', (reason: string) => {
      this._lastReject = reason
      this.emit()
      // 3秒后自动清除
      if (this.rejectTimer) clearTimeout(this.rejectTimer)
      this.rejectTimer = setTimeout(() => {
        this._lastReject = null
        this.emit()
      }, 3000)
    })

    socket.on('game:notify', (payload: unknown) => {
      this._notifications = [...this._notifications, payload]
      this.emit()
    })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => ({
    state: this._state,
    lastReject: this._lastReject,
    notifications: this._notifications,
  })

  sendAction = (action: unknown) => {
    this.socket.emit('game:action', action, ++this.seq)
  }

  /** 组件卸载时调用 */
  destroy() {
    if (this.rejectTimer) clearTimeout(this.rejectTimer)
    this.socket.off('game:state')
    this.socket.off('game:reject')
    this.socket.off('game:notify')
  }

  private emit() {
    this.listeners.forEach(l => l())
  }
}

// Hook
function useGame(socket: Socket) {
  const storeRef = useRef<GameStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = new GameStore(socket)
  }

  useEffect(() => {
    return () => storeRef.current?.destroy()
  }, [])

  const snapshot = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
  )

  return { ...snapshot, sendAction: storeRef.current.sendAction }
}
```

### 8.6 Game 页面（含 Suspense）

```tsx
// pages/Game.tsx
import { Suspense } from 'react'
import { clientRegistry } from '@games/client-registry'
import { Loading } from '../components/Loading'

function Game() {
  const { userId } = useIdentity()
  const { room } = useRoom()
  const { state, sendAction, lastReject, notifications } = useGame()

  if (!room || !state) return <Loading />

  const plugin = clientRegistry[room.gameId]
  if (!plugin) return <div>未知游戏</div>

  const Board = plugin.Board

  return (
    <Suspense fallback={<Loading />}>
      <Board
        state={state}
        myId={userId}
        players={room.players}
        sendAction={sendAction}
        lastReject={lastReject}
        notifications={notifications}
      />
    </Suspense>
  )
}
```

### 8.7 音效触发策略

```
方式 A（服务端驱动）：
  onAction 返回的 NOTIFY / NOTIFY_ALL payload 携带 { sound: 'xxx' }
  客户端收到 notify → 有 sound 字段 → useSound.play(sound)
  适合：游戏结束、特殊事件

方式 B（客户端 diff 驱动）：
  Board 组件内 useEffect 比较前后 state
  手牌减少 → play('card-play')
  回合变成自己 → play('turn-notify')
  适合：常规操作

V1 默认方式 B，方式 A 作为补充。
```

### 8.8 CORS 配置

```
开发环境：
  Vite dev server proxy：/socket.io/* → Express 端口
  同源，无 CORS

生产环境（推荐同源部署）：
  Express serve 前端静态文件：
    app.use(express.static(path.join(__dirname, '../client/dist')))
    app.get('*', (_, res) => res.sendFile('index.html'))
```

---

## 九、动画方案

```
V1 策略：
  - Framer Motion 的 layoutId prop 自动处理位置变化动画
  - AnimatePresence 处理元素进出场
  - 不做精细动画队列

覆盖场景：
  - 卡牌出牌 → 手牌自动收缩（layout 动画）
  - 新卡入手 → 自动展开
  - 棋子移动 → 位置过渡
  - 翻牌 → rotateY 动画
  - 元素消失/出现 → AnimatePresence 进出场

V2 升级方向：
  - 精细动画队列（先播飞行动画，再更新状态）
  - 粒子效果（胜利烟花等）
```

---

## 十、测试架构

### 10.1 测试分层

```
┌──────────────────────────────────────────────────┐
│  E2E 测试        Playwright                       │
│    tests/e2e/*.spec.ts                            │
│    多浏览器模拟多玩家完整流程                         │
├──────────────────────────────────────────────────┤
│  引擎集成测试    Vitest                            │
│    packages/server/__tests__/*.test.ts            │
│    测试 ActionPipeline / RoomManager / GameRoom   │
│    使用 mock GameLogic                             │
├──────────────────────────────────────────────────┤
│  游戏逻辑单元测试  Vitest                          │
│    games/xxx/logic.test.ts                        │
│    纯函数测试，无服务器依赖                          │
│    使用 GameTestHarness                            │
└──────────────────────────────────────────────────┘
```

### 10.2 GameTestHarness（游戏逻辑测试夹具）

```ts
// packages/shared/testing/game-harness.ts

import type { GameLogic, GameContext, ActionResult, EngineEvent, SeededRandom } from '../types/engine'
import seedrandom from 'seedrandom'

export interface HarnessOptions {
  players: string[]
  seed?: string
  config?: unknown
}

/**
 * 用于测试游戏逻辑的自包含夹具。
 * 不依赖服务端、Socket、数据库。
 *
 * 使用方式：
 *   const h = new GameTestHarness(unoLogic, { players: ['Alice', 'Bob'], seed: 'test' })
 *   h.setup()
 *   const r = h.action('Alice', { type: 'play_card', card: ... })
 *   expect(r.ok).toBe(true)
 *   expect(h.view('Alice').hand).toHaveLength(6)
 */
export class GameTestHarness<TState, TAction, TView> {
  private logic: GameLogic<TState, TAction, TView>
  private _state!: TState
  private _ctx: GameContext
  private _lastEvents: EngineEvent[] = []
  private _allEvents: EngineEvent[] = []
  private config: unknown

  constructor(logic: GameLogic<TState, TAction, TView>, options: HarnessOptions) {
    this.logic = logic
    this.config = options.config
    const seed = options.seed ?? `test-${Date.now()}`
    this._ctx = {
      players: options.players,
      random: createSeededRandom(seed),
    }
  }

  /** 初始化游戏 */
  setup(): void {
    this._state = this.logic.setup(this._ctx, this.config)
  }

  /** 执行一个动作。先做 Zod 校验，再调用 onAction。 */
  action(playerID: string, action: TAction): ActionResult<TState> {
    const parsed = this.logic.actions.safeParse(action)
    if (!parsed.success) {
      return { ok: false, reason: `Zod validation: ${parsed.error.message}` }
    }

    const result = this.logic.onAction(this._state, parsed.data, playerID, this._ctx)
    if (result.ok) {
      this._state = result.state
      this._lastEvents = result.events ?? []
      this._allEvents.push(...this._lastEvents)
    } else {
      this._lastEvents = []
    }
    return result
  }

  /** 模拟定时器触发 */
  timer(name: string): ActionResult<TState> {
    if (!this.logic.onTimer) throw new Error('Game does not implement onTimer')
    const result = this.logic.onTimer(this._state, name, this._ctx)
    if (result.ok) {
      this._state = result.state
      this._lastEvents = result.events ?? []
      this._allEvents.push(...this._lastEvents)
    } else {
      this._lastEvents = []
    }
    return result
  }

  /** 获取某个玩家的视角 */
  view(playerID: string): TView {
    return this.logic.getPlayerView(this._state, playerID)
  }

  /** 获取观众视角 */
  spectatorView(): TView | undefined {
    return this.logic.getSpectatorView?.(this._state)
  }

  /** 最近一次 action/timer 产生的事件 */
  get lastEvents(): EngineEvent[] { return this._lastEvents }

  /** 累积所有事件 */
  get allEvents(): EngineEvent[] { return [...this._allEvents] }

  /** 游戏是否已结束 */
  get isFinished(): boolean {
    return this._allEvents.some(e => e.type === 'END_GAME')
  }

  /** 排名（游戏结束时） */
  get rankings(): string[] | null {
    const end = [...this._allEvents].reverse().find(e => e.type === 'END_GAME')
    return end ? (end as Extract<EngineEvent, { type: 'END_GAME' }>).rankings : null
  }

  /** 直接访问完整内部状态（白盒测试用） */
  get rawState(): TState { return this._state }

  /** 玩家列表 */
  get players(): string[] { return this._ctx.players }
}

function createSeededRandom(seed: string): SeededRandom {
  const rng = seedrandom(seed)
  return {
    seed,
    int(min, max) { return min + Math.floor(rng() * (max - min + 1)) },
    float() { return rng() },
    shuffle<T>(arr: T[]): T[] {
      const result = [...arr]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
  }
}
```

### 10.3 游戏逻辑测试示例

```ts
// games/uno/logic.test.ts

import { describe, it, expect } from 'vitest'
import { GameTestHarness } from '@repo/shared/testing'
import { logic } from './logic'

describe('UNO Logic', () => {
  function createGame(seed = 'test-seed') {
    const h = new GameTestHarness(logic, {
      players: ['Alice', 'Bob', 'Charlie'],
      seed,
    })
    h.setup()
    return h
  }

  describe('setup', () => {
    it('deals 7 cards to each player', () => {
      const h = createGame()
      expect(h.view('Alice').hand).toHaveLength(7)
      expect(h.view('Bob').hand).toHaveLength(7)
      expect(h.view('Charlie').hand).toHaveLength(7)
    })

    it('has a discard pile with one card', () => {
      const h = createGame()
      expect(h.view('Alice').discardTop).toBeDefined()
    })

    it('hides other players\' hands', () => {
      const h = createGame()
      const view = h.view('Alice')
      expect(view.opponents.every(o => o.cardCount > 0 && !('cards' in o))).toBe(true)
    })
  })

  describe('play_card', () => {
    it('accepts a valid card play', () => {
      const h = createGame('fixed-seed-1')
      const view = h.view('Alice')
      // 找一张可以打的牌
      const validCard = view.hand.find(c => canPlay(c, view.discardTop))
      if (validCard) {
        const result = h.action('Alice', { type: 'play_card', card: validCard })
        expect(result.ok).toBe(true)
        expect(h.view('Alice').hand).toHaveLength(6)
      }
    })

    it('rejects play out of turn', () => {
      const h = createGame()
      const result = h.action('Bob', { type: 'play_card', card: h.view('Bob').hand[0] })
      expect(result.ok).toBe(false)
      expect((result as any).reason).toContain('not your turn')
    })
  })

  describe('draw_card', () => {
    it('draws a card and adds to hand', () => {
      const h = createGame()
      const before = h.view('Alice').hand.length
      h.action('Alice', { type: 'draw_card' })
      expect(h.view('Alice').hand.length).toBe(before + 1)
    })
  })

  describe('game end', () => {
    it('ends when a player has zero cards', () => {
      // 可以使用特殊 seed 或直接操作 rawState (白盒测试)
      const h = createGame()
      // ... 模拟打完所有牌 ...
      // expect(h.isFinished).toBe(true)
      // expect(h.rankings?.[0]).toBe('Alice')
    })
  })
})
```

### 10.4 引擎测试

```ts
// packages/server/__tests__/action-pipeline.test.ts

import { describe, it, expect, vi } from 'vitest'
import { GameRoom } from '../engine/GameRoom'
import type { GameLogic } from '@repo/shared'

// Mock 游戏：简单的计数器
const mockLogic: GameLogic = {
  actions: z.discriminatedUnion('type', [
    z.object({ type: z.literal('increment') }),
    z.object({ type: z.literal('invalid_action') }),
  ]),
  setup(ctx) {
    return { count: 0, currentPlayer: ctx.players[0] }
  },
  onAction(state, action, playerID) {
    if (action.type === 'increment') {
      if (playerID !== state.currentPlayer) {
        return { ok: false, reason: 'Not your turn' }
      }
      return { ok: true, state: { ...state, count: state.count + 1 }, events: [] }
    }
    return { ok: false, reason: 'Unknown action' }
  },
  getPlayerView(state, playerID) {
    return { count: state.count, isMyTurn: playerID === state.currentPlayer }
  },
}

describe('ActionPipeline', () => {
  it('rejects action with invalid Zod schema', () => { /* ... */ })
  it('rejects action when ok:false', () => { /* ... */ })
  it('updates state when ok:true', () => { /* ... */ })
  it('catches onAction exceptions gracefully', () => { /* ... */ })
  it('ignores duplicate seq', () => { /* ... */ })
  it('throttles rapid actions', () => { /* ... */ })
})

describe('RoomManager', () => {
  it('creates and finds rooms', () => { /* ... */ })
  it('maintains userToRoom index', () => { /* ... */ })
  it('cleans up finished rooms after 5 minutes', () => { /* ... */ })
  it('cleans up empty waiting rooms after 10 minutes', () => { /* ... */ })
  it('restores only playing rooms from DB', () => { /* ... */ })
})
```

### 10.5 Playwright E2E 测试

#### 配置

```ts
// playwright.config.ts（项目根目录）

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,             // 游戏测试需要多玩家交互，不能并行
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

#### 多玩家测试 Helper

```ts
// tests/e2e/helpers/multi-player.ts

import { Browser, Page } from '@playwright/test'

/**
 * 创建一个新的玩家 context + page。
 * 每个 context 有独立的 localStorage（独立身份）。
 */
export async function createPlayer(
  browser: Browser,
  name?: string,
): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()

  // 如果指定名字，在 localStorage 中预设
  if (name) {
    await page.addInitScript((playerName) => {
      const nanoid = () => Math.random().toString(36).slice(2, 10)
      localStorage.setItem('identity', JSON.stringify({
        userId: nanoid(),
        userName: playerName,
      }))
    }, name)
  }

  return page
}

/** 创建房间并返回房间码 */
export async function createRoom(page: Page, gameId: string): Promise<string> {
  await page.goto('/')
  await page.click(`[data-testid="game-card-${gameId}"]`)
  await page.click('[data-testid="create-room-btn"]')
  await page.waitForSelector('[data-testid="room-code"]')
  const code = await page.textContent('[data-testid="room-code"]')
  return code!.trim()
}

/** 通过房间码加入房间 */
export async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto('/')
  await page.fill('[data-testid="room-code-input"]', roomCode)
  await page.click('[data-testid="join-room-btn"]')
  await page.waitForSelector('[data-testid="room-page"]')
}

/** 准备 */
export async function ready(page: Page): Promise<void> {
  await page.click('[data-testid="ready-btn"]')
}

/** 开始游戏（房主） */
export async function startGame(page: Page): Promise<void> {
  await page.click('[data-testid="start-btn"]')
  await page.waitForSelector('[data-testid="game-board"]')
}
```

```ts
// tests/e2e/helpers/wait-for.ts

import { Page, expect } from '@playwright/test'

/** 等待 game-board 出现 */
export async function waitForGameBoard(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 5000 })
}

/** 等待游戏结束弹窗 */
export async function waitForGameOver(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="game-over-modal"]')).toBeVisible({ timeout: 60_000 })
}
```

#### E2E 测试示例

```ts
// tests/e2e/room-flow.spec.ts

import { test, expect } from '@playwright/test'
import { createPlayer, createRoom, joinRoom, ready, startGame } from './helpers/multi-player'

test.describe('Room Flow', () => {
  test('create room → join → ready → start', async ({ browser }) => {
    const alice = await createPlayer(browser, 'Alice')
    const bob = await createPlayer(browser, 'Bob')

    // Alice 创建 UNO 房间
    const roomCode = await createRoom(alice, 'uno')
    expect(roomCode).toHaveLength(6)

    // Bob 加入
    await joinRoom(bob, roomCode)

    // 两人都应该看到对方
    await expect(alice.locator('[data-testid="player-list"] >> text=Bob')).toBeVisible()
    await expect(bob.locator('[data-testid="player-list"] >> text=Alice')).toBeVisible()

    // 准备
    await ready(alice)
    await ready(bob)

    // Alice（房主）开始
    await startGame(alice)

    // 两人都应进入游戏
    await expect(alice.locator('[data-testid="game-board"]')).toBeVisible()
    await expect(bob.locator('[data-testid="game-board"]')).toBeVisible()

    // 清理
    await alice.context().close()
    await bob.context().close()
  })

  test('disconnect and reconnect preserves state', async ({ browser }) => {
    const alice = await createPlayer(browser, 'Alice')
    const bob = await createPlayer(browser, 'Bob')

    const roomCode = await createRoom(alice, 'uno')
    await joinRoom(bob, roomCode)
    await ready(alice)
    await ready(bob)
    await startGame(alice)

    // Alice 刷新页面
    await alice.reload()

    // 应该自动恢复到游戏页面
    await expect(alice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 5000 })

    await alice.context().close()
    await bob.context().close()
  })
})
```

```ts
// tests/e2e/uno.spec.ts

import { test, expect } from '@playwright/test'
import { createPlayer, createRoom, joinRoom, ready, startGame, waitForGameBoard } from './helpers/multi-player'

test.describe('UNO E2E', () => {
  test('two players can play UNO', async ({ browser }) => {
    const alice = await createPlayer(browser, 'Alice')
    const bob = await createPlayer(browser, 'Bob')

    const roomCode = await createRoom(alice, 'uno')
    await joinRoom(bob, roomCode)
    await ready(alice)
    await ready(bob)
    await startGame(alice)
    await waitForGameBoard(alice)
    await waitForGameBoard(bob)

    // 验证初始手牌
    const aliceCards = alice.locator('[data-testid^="hand-card-"]')
    await expect(aliceCards).toHaveCount(7)

    const bobCards = bob.locator('[data-testid^="hand-card-"]')
    await expect(bobCards).toHaveCount(7)

    // 验证弃牌堆有一张牌
    await expect(alice.locator('[data-testid="discard-pile"]')).toBeVisible()

    // Alice 尝试出牌（点击第一张手牌）
    // 具体行为取决于 Board.tsx 的实现
    await alice.locator('[data-testid="hand-card-0"]').click()

    // ... 更多交互验证 ...

    await alice.context().close()
    await bob.context().close()
  })
})
```

### 10.6 data-testid 规范

所有可交互 / 可断言的 UI 元素必须标注 `data-testid`，遵循以下约定：

```
=== 大厅（Lobby） ===
data-testid="game-card-{gameId}"      游戏选择卡片
data-testid="create-room-btn"         创建房间按钮
data-testid="room-code-input"         房间码输入框
data-testid="join-room-btn"           加入房间按钮

=== 房间（Room） ===
data-testid="room-page"               房间页容器
data-testid="room-code"               显示的房间码文本
data-testid="player-list"             玩家列表容器
data-testid="player-{seatIndex}"      单个玩家条目
data-testid="ready-btn"               准备按钮
data-testid="start-btn"               开始游戏按钮（仅房主可见）

=== 游戏（通用） ===
data-testid="game-board"              游戏画板容器
data-testid="game-over-modal"         游戏结束弹窗
data-testid="restart-btn"             再来一局按钮
data-testid="turn-indicator"          当前回合指示

=== 卡牌类 ===
data-testid="hand-card-{index}"       手牌中的第 N 张
data-testid="discard-pile"            弃牌堆
data-testid="draw-deck"               摸牌堆

=== 棋盘类 ===
data-testid="grid-cell-{row}-{col}"   棋盘格子

=== 骰子类 ===
data-testid="dice-{index}"            第 N 个骰子
data-testid="roll-btn"                掷骰按钮
```

**AI Prompt 中会包含此规范，确保生成的 Board.tsx 自带正确的 testid。**

### 10.7 测试命令

```json
// 根 package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:game": "vitest run games/",
    "test:engine": "vitest run packages/server/",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "vitest run && playwright test"
  }
}
```

---

## 十一、AI Prompt 模板

> 以下 Prompt 自包含所有 AI 需要的上下文。AI 不需要浏览任何源代码文件，只需此 Prompt + 游戏规则即可生成完整插件。

````markdown
# 任务

为桌游平台生成 **{游戏名}** 的完整游戏插件。

---

# 你需要生成 4 个文件

## 文件 1：shared.ts

包含三部分：
1. `meta`：GameMeta 对象
2. `actionSchema`：Zod discriminatedUnion，定义所有合法动作
3. 类型导出：`Action`（从 Zod 推导）、`View`（玩家视角类型）

```ts
// 示例结构
import { z } from 'zod'
import type { GameMeta } from '@repo/shared'

export const meta: GameMeta = {
  id: 'my-game',
  name: '游戏名',
  description: '...',
  minPlayers: 2,
  maxPlayers: 4,
  tags: ['card'],
  // actionThrottleMs: 100,       // 可选，覆盖默认节流
  // configSchema: z.object({...}),  // 可选，变体配置
  // defaultConfig: {...},
}

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('some_action'), /* ... */ }),
])

export type Action = z.infer<typeof actionSchema>

export interface View {
  // 当前玩家能看到的信息
}
```

## 文件 2：logic.ts

实现 GameLogic 接口。这是游戏的全部规则。

```ts
import type { GameLogic, GameContext, ActionResult, EngineEvent } from '@repo/shared'
import { actionSchema, type Action, type View } from './shared'
// 如果需要并发行动模式：
// import { PendingPhase, createPendingPhase, collectResponse, fillDefaults } from '@repo/shared/utils/pending-phase'

// TState 定义在此文件内部，不导出（客户端看不到）
interface State {
  // 完整游戏状态
}

export const logic: GameLogic<State, Action, View> = {
  actions: actionSchema,

  setup(ctx: GameContext, config?: unknown): State {
    // 初始化。用 ctx.random 洗牌/发牌/掷骰。
  },

  onAction(state: State, action: Action, playerID: string, ctx: GameContext): ActionResult<State> {
    // 操作非法 → return { ok: false, reason: '说明' }
    // 操作合法 → return { ok: true, state: newState, events: [...] }
  },

  getPlayerView(state: State, playerID: string): View {
    // 过滤掉该玩家不应看到的信息
  },

  // 可选
  onTimer(state: State, timerName: string, ctx: GameContext): ActionResult<State> { },
  onPlayerDisconnect(state: State, playerID: string, ctx: GameContext): ActionResult<State> { },
}
```

## 文件 3：logic.test.ts

使用 GameTestHarness 编写单元测试。

```ts
import { describe, it, expect } from 'vitest'
import { GameTestHarness } from '@repo/shared/testing'
import { logic } from './logic'

describe('游戏名', () => {
  function create(seed = 'test') {
    const h = new GameTestHarness(logic, {
      players: ['Alice', 'Bob'],
      seed,
    })
    h.setup()
    return h
  }

  it('初始化正确', () => {
    const h = create()
    // 验证初始视角
  })

  it('合法操作被接受', () => {
    const h = create()
    const r = h.action('Alice', { type: '...', ... })
    expect(r.ok).toBe(true)
  })

  it('非法操作被拒绝', () => {
    const h = create()
    const r = h.action('Bob', { type: '...', ... })
    expect(r.ok).toBe(false)
  })
})
```

**GameTestHarness API：**
- `new GameTestHarness(logic, { players, seed?, config? })` — 创建测试实例
- `.setup()` — 初始化游戏
- `.action(playerID, action)` — 提交动作，返回 `{ ok, state?, reason? }`
- `.timer(name)` — 模拟定时器触发
- `.view(playerID)` — 获取玩家视角
- `.rawState` — 白盒：直接访问完整内部状态
- `.lastEvents` — 最近一次操作产生的引擎事件
- `.isFinished` / `.rankings` — 游戏是否结束 / 排名

## 文件 4：Board.tsx

React 组件，接收 `BoardProps<View, Action>`。

```tsx
import type { BoardProps } from '@repo/shared'
import type { View, Action } from './shared'

export const Board: React.FC<BoardProps<View, Action>> = ({
  state, myId, players, sendAction, lastReject, notifications,
}) => {
  return (
    <div data-testid="game-board">
      {/* 游戏 UI */}
    </div>
  )
}
```

---

# 可用预制组件

从 `@repo/game-ui` 导入：

| 组件 | 用途 | 关键 Props |
|------|------|-----------|
| `PlayingCard` | 单张卡牌 | `face`, `back?`, `faceUp?`, `onClick?`, `data-testid?` |
| `CardHand` | 手牌排列 | `cards`, `onCardClick?`, `fan?