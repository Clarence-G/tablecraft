# Auth + Points + Homepage Redesign — Design Spec

**Date**: 2026-04-22
**Status**: Approved, pending implementation plan

## 1. 动机与范围

### 1.1 动机

把 boardgames 推向"生产级"的三个方向：

1. **用户身份**：目前玩家仅靠 `localStorage` 里的 nanoid 标识，平台没有真实用户概念；接入 BetterAuth 提供注册/登录能力，为积分、战绩、排行榜打基础。
2. **积分系统**：纯展示型的只涨积分，增加回访动机，支撑榜单功能。
3. **首页改版**：保留并精致化现有 warm skeuomorphic 设计语言，重组信息架构，避免游戏平铺带来的拥挤感。

### 1.2 范围（In scope）

- BetterAuth 邮箱密码 + GitHub OAuth 登录（不做邮箱验证）
- 游客模式保留，登录后一次性合并游客历史数据
- 纯展示积分账本（`points_ledger`），支持全局和分游戏查询
- Bot token 从内存 `TokenStore` 迁到 DB 表 `bot_tokens` 持久化
- 数据库从 SQLite 迁到 PGlite（drizzle dialect 切 `pg-core`）
- 首页重做（Hero → Active rooms → Recently played → All games），新增 `/games`、`/rooms`、`/leaderboard`、`/login`、`/register`、`/me` 页面
- 每日签到（登录态 session 激活时自动触发）

### 1.3 非范围（Out of scope）

- ORPC / tRPC / GraphQL — 继续 REST
- 邮箱验证、密码重置、多因素认证、多端登录管理
- ELO 段位、下注/经济系统、周/月榜
- Bot 变成 user / API key 插件 / bot 排行榜
- 头像上传（GitHub OAuth 自带 image，email 用户用首字母占位）
- 生产部署方案切换（先用 PGlite，数据增长后再迁真 PG）
- 本周榜 / 本月榜 / 胜率等派生统计
- 移动端 PWA / 原生应用

## 2. 架构总览

```
Browser                           Server (Express + Socket.io)
┌─────────────────────┐           ┌───────────────────────────────────┐
│  Vite + React       │  HTTP     │  /api/auth/*   BetterAuth handler │
│  pages + hooks      │ ────────▶ │  /api/*        REST (existing+new)│
│  cookie session     │  WS       │  Socket.io     room engine        │
│                     │ ────────▶ │  (unchanged: RoomManager/GameRoom)│
└─────────────────────┘           └─────────────┬─────────────────────┘
                                                ▼
                                    ┌─────────────────────────────────┐
                                    │  Drizzle (PG dialect) → PGlite  │
                                    │  ./pgdata                       │
                                    └─────────────────────────────────┘
Bot / CLI ─── x-api-key ───▶  middleware (bot_tokens table lookup)
```

### 2.1 主要新增 / 变更

- 新依赖：`better-auth`、`@better-auth/drizzle-adapter`、`@electric-sql/pglite`；移除 `better-sqlite3`
- `packages/server`：新增 `lib/auth.ts`、`middleware/session.ts`、`middleware/actor.ts`；`api/router.ts` 新增路由；`index.ts` 挂 `auth.handler`；`TokenStore` 内部换 DB
- `packages/client`：新增 `pages/{Login,Register,GamesAll,RoomsAll,Leaderboard,Me}.tsx`；重做 `pages/Lobby.tsx`；新增 `hooks/useSession.ts`；改造 `hooks/useIdentity.ts`
- `packages/shared`：新增用户/积分共享类型
- `@repo/game-ui`：新增 `UserChip`、`PointsBadge`、`Stat`、`SectionHead`、`QuickJoinInput`、`ResumeCard`、`LeaderboardRow`、`ViewAllRow` 组件（保持 skeuomorphic 语言）

### 2.2 不变

- 游戏引擎 `GameLogic` 接口
- 所有 `games/*/*` 代码
- CLI 命令形状（`packages/cli`）
- Socket.io 通信协议（handshake 字段兼容扩展）

### 2.3 关键边界

- **BetterAuth 只管人类用户**（cookie session），**Bot 走独立 `x-api-key` 通道**（bot_tokens 表），两条认证链不互通
- **游戏引擎层对身份无感**：`GameLogic` 拿到的 players 仍是字符串 id；胜局写 ledger 时才根据 `isGuest` 挑 `user_id` / `guest_id` 列
- **Socket.io 握手会二次校验** `userId == session.user.id`，防止伪装

## 3. 数据模型

### 3.1 BetterAuth 管理的表

`user` / `session` / `account` / `verification` — 由 `@better-auth/drizzle-adapter` 自动生成迁移。

**唯一业务扩展**：`user` 表加字段

```ts
claimedGuestId: text('claimed_guest_id').unique()  // 防止单个 guestId 被多用户合并
```

### 3.2 新增业务表

#### points_ledger

```ts
export const pointsLedger = pgTable('points_ledger', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  guestId: text('guest_id'),
  gameId: text('game_id').notNull(),
  roomId: text('room_id'),
  reason: text('reason').notNull(),      // 'win' | 'draw' | 'daily_checkin' | 'admin_grant'
  points: integer('points').notNull(),   // 正整数
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index().on(t.userId, t.createdAt.desc()),
  gameIdx: index().on(t.gameId, t.createdAt.desc()),
  guestIdx: index().on(t.guestId),
  ownerCheck: sql`CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)`,
}))
```

#### bot_tokens

```ts
export const botTokens = pgTable('bot_tokens', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),  // sha256(明文)，明文只在创建返回一次
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),     // 软删除
})
```

### 3.3 现有表迁移

`rooms` / `room_players` / `action_log`：字段语义不变，仅 SQLite → PG dialect 重写（`INTEGER` → `integer`，`TEXT` → `text`，`DATETIME` → `timestamp`）。运行时数据不迁移存量，直接重建。

### 3.4 关键查询

```sql
-- 用户全局积分
SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE user_id = ?;

-- 用户分游戏积分
SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE user_id = ? AND game_id = ?;

-- 全局 Top 50
SELECT user_id, SUM(points) AS total FROM points_ledger
WHERE user_id IS NOT NULL GROUP BY user_id
ORDER BY total DESC LIMIT 50;

-- 游客 → 用户合并（事务）
BEGIN;
  UPDATE points_ledger SET user_id = $userId, guest_id = NULL
    WHERE guest_id = $guestId AND user_id IS NULL;
  UPDATE "user" SET claimed_guest_id = $guestId WHERE id = $userId;
COMMIT;
```

### 3.5 取舍

- **不做 materialized view**：PGlite 规模下 GROUP BY + 索引够用
- **签到共享 points_ledger**（`reason='daily_checkin'`）：应用层判重（当日是否已有 daily_checkin 记录）
- **Token 以 hash 存储**：明文仅创建时返回一次；CLI 本地 `~/.tablecraft/config.json` (chmod 600)
- **CHECK 约束兜底**：`user_id IS NOT NULL OR guest_id IS NOT NULL`，防止孤儿记录
- **默认积分规则**（写在 `lib/points.ts` 的常量，可调）：`win: 10, draw: 3, loss: 0, daily_checkin: 5`

## 4. 认证流程

### 4.1 注册 / 登录

前端调 `authClient.signUp.email({ email, password, name })` → `POST /api/auth/sign-up/email` → BetterAuth 写 user/account/session，set cookie → `useSession()` 自动刷新 → 重定向 `/` → **立刻触发游客合并（4.3）**。

GitHub OAuth：`authClient.signIn.social({ provider: 'github' })` → 跳转授权 → callback → 一样触发合并。

### 4.2 Session 校验（server 端）

```ts
// packages/server/src/middleware/session.ts
export async function sessionMiddleware(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers })
  req.session = session
  next()
}
```

需要登录的接口用 `requireUser(req)` 小工具（`req.session?.user ?? throw 401`）。

### 4.3 游客 → 用户合并（关键路径）

```
触发时机: 登录/注册成功后 client 立刻调:
  POST /api/me/claim-guest  body: { guestId: localStorage.userId }

server:
  if !req.session.user → 401
  if req.session.user.claimedGuestId → 409 (已合并过)
  SELECT 1 FROM user WHERE claimed_guest_id = $guestId → 409 if exists (先到先得)
  BEGIN
    UPDATE points_ledger SET user_id=$userId, guest_id=NULL
      WHERE guest_id=$guestId AND user_id IS NULL
    UPDATE user SET claimed_guest_id=$guestId WHERE id=$userId
  COMMIT
  return { mergedRows: n }

client:
  useIdentity.linkedUserId = user.id
  Toast: "已关联你之前的 N 条战绩"
```

**设计不变量**：一个浏览器 = 一个 guest id，合并只能做一次（由 `claimed_guest_id` unique 保证）。反向"一人多浏览器"不支持多 guest 合并（产品上可接受的折中）。

### 4.4 Socket.io 握手

```ts
// server 端二次校验
io.use(async (socket, next) => {
  const { userId, userName, isGuest } = socket.handshake.auth
  if (!isGuest) {
    const session = await auth.api.getSession({ headers: socket.handshake.headers })
    if (!session || session.user.id !== userId) return next(new Error('unauthorized'))
  }
  socket.data = { userId, userName, isGuest }
  next()
})
```

`GameRoom` 完全无感，只在胜局写 ledger 时判断 `isGuest`：

```ts
await db.insert(pointsLedger).values({
  userId:  socketData.isGuest ? null : playerId,
  guestId: socketData.isGuest ? playerId : null,
  gameId, roomId, reason: result, points: POINTS[result],
})
```

### 4.5 Bot token 认证

**范围限定**：仅 server 侧内部实现变化（TokenStore 内存 Map → DB 查询），**CLI 零改动**，token header 形状不变。

```
CLI → header 'x-api-key: <token>' (或现有的 Bearer, 视 CLI 现状)

server middleware:
  const hash = sha256(raw)
  const row = await db.query.botTokens.findFirst({
    where: and(eq(tokenHash, hash), isNull(revokedAt))
  })
  if (!row) → 401
  异步 UPDATE last_used_at (不阻塞)
  req.bot = { id, name }

/api/admin/token 保留:
  - 接口签名不变
  - 明文 token 仅在创建响应体里返回一次 (调用方必须立刻保存)
  - 数据库只存 sha256(token) hash; 丢失明文无法恢复, 需重签
```

**迁移**：上线时内存 TokenStore 变 DB 表。现有签发过的内存 token 失效（本来重启就失效，语义一致），admin 重签后发给 bot 使用者即可。CLI 取 token 的现状方式（env var / config / 命令参数）**不做主动改造**，按实际现状兼容。

### 4.6 登出

`POST /api/auth/sign-out` → 删 session，清 cookie → useSession null → useIdentity 保留当前 guest id（再次登录会因 `claimed_guest_id` 已占而 409，这是设计意图）。

## 5. REST API

### 5.1 BetterAuth 挂载

```
POST /api/auth/sign-up/email
POST /api/auth/sign-in/email
POST /api/auth/sign-out
GET  /api/auth/session
GET  /api/auth/callback/github
POST /api/auth/sign-in/social
```

### 5.2 现有路由认证策略调整

| 路由 | 原 | 新 |
|---|---|---|
| `POST /api/admin/token` | hardcoded admin secret | 不变，内部换 DB |
| `POST /api/rooms` | Bearer or 无 | cookie session **或** x-api-key |
| `POST /api/rooms/:code/join` | 同上 | 同上 |
| `POST /api/rooms/:code/action` | 同上 | 同上 |
| `GET /api/rooms` / `/api/games*` | 无 | 无（公开） |

统一 `resolveActor(req): Actor` 中间件抹平 user/bot/guest 差异：

```ts
type Actor =
  | { kind: 'user'; id: string; name: string }
  | { kind: 'bot';  id: string; name: string }
  | { kind: 'guest'; id: string; name: string }
```

### 5.3 新增路由

```
# 当前用户（cookie session）
GET   /api/me                           { user, points: {global, byGame}, recentGames }
POST  /api/me/claim-guest               body: { guestId }
PATCH /api/me                           body: { name? }
# daily-checkin: 无独立端点、无按钮
#   触发点: sessionMiddleware 在识别到 user session 后, 异步(不阻塞请求)检查
#   "当前 user 今日是否已有 reason='daily_checkin' 的 ledger 记录";
#   无则插入一条; 有则跳过. 避免 client 发额外请求.

# 公开
GET   /api/leaderboard?gameId=&limit=50 { entries, total }
GET   /api/leaderboard/me?gameId=       { rank, points, total } | { rank: null, points }

# 游客积分（nanoid 不可枚举，公开读）
GET   /api/guest/:guestId/points        { global, byGame }

# Admin
POST  /api/admin/token                  创建 bot token (现有)
GET   /api/admin/tokens                 列出 (新增)
POST  /api/admin/tokens/:id/revoke      吊销 (新增)
```

### 5.4 错误格式

- 新路由返回 `{ error: { code, message } }`，HTTP status 对应
- 现有路由保持兼容，不改返回格式

### 5.5 取舍

- 不做 API 版本前缀（内部 API，有破坏性改动直接改）
- Leaderboard 不分页（Top 50 + `/me` 拿自己排名）
- 无 ORPC / tRPC / GraphQL
- 游客积分用 path 里的 guestId 公开读（nanoid 猜不到，数据不敏感）

## 6. 前端

### 6.1 路由

```
/                    Lobby (重做)
/games               GamesAll (新, ViewAll)
/rooms               RoomsAll (新, ViewAll)
/leaderboard         Leaderboard (新)
/login               Login (新)
/register            Register (新)
/me                  Me (新, 可后置)
/room/:code          Room (不变)
/room/:code/game     Game (不变)
```

### 6.2 Lobby 组件树

```tsx
<Lobby>
  <TopNav>
    <Logo /> <NavLinks /> <LangToggle /> <UserChip />  {/* UserChip 新增 */}
  </TopNav>
  <HeroSection>
    {isLoggedIn ? <HeroLoggedIn /> : <HeroGuest />}
  </HeroSection>
  <ActiveRoomsRow>  <SectionHead title viewAllHref="/rooms" />  <RoomCardRow /> </ActiveRoomsRow>
  {isLoggedIn && recentGames.length > 0 && (
    <RecentlyPlayedRow>  <SectionHead title viewAllHref="/me" />  <GameCardRow /> </RecentlyPlayedRow>
  )}
  <AllGamesSection>  <SectionHead title viewAllHref="/games" />  <GameGrid featured /> </AllGamesSection>
</Lobby>
```

375px 移动端：所有 Row 横向滚动，GameGrid 变 2 列。

### 6.3 Hero

- **HeroGuest**：左 `欢迎，{guestName} · 登录保存战绩` + `Sign up` / `Sign in` 按钮；右 `QuickJoinInput` + 活动摘要
- **HeroLoggedIn**：左 `你回来了，{name}` + `Points` / `Rank` stats；右 `ResumeCard`（上次未完对局）+ `QuickJoinInput`

### 6.4 新 @repo/game-ui 组件

`UserChip`、`PointsBadge`、`Stat`、`SectionHead`、`QuickJoinInput`、`ResumeCard`、`LeaderboardRow`、`ViewAllRow`。Login/Register 表单不抽组件，直接在 client 写。

### 6.5 Login / Register 页

单卡片居中：GitHub 按钮 + Divider + email/password 表单 + 链接切换。成功后 → claim-guest → Toast → 重定向 `/`。不做"Continue as guest"按钮。

### 6.6 GamesAll / RoomsAll / Leaderboard / Me

- **GamesAll**：搜索 + tag filter + 完整 GameGrid，URL query 持久化
- **RoomsAll**：game/status filter + 房间列表 + 空状态 CTA
- **Leaderboard**：gameId tab 切换 + Top 50 列表，非 Top 50 用户底部 sticky "You · #128"
- **Me**：昵称编辑 + 积分明细（按游戏 + 最近 20 条 ledger）+ 登出

### 6.7 Hooks

```ts
// useIdentity (改造)
{
  guestId, guestName,
  linkedUserId: session?.user?.id ?? null,
  displayName: session?.user?.name ?? guestName,
  actorId: session?.user?.id ?? guestId,
  isGuest: !session?.user,
}

// useSession (新, BetterAuth client 封装)
// usePoints (新, SWR 风简封装)
```

不引入新 state 库；最小 `useFetch(url)` 封装避免额外依赖。

### 6.8 i18n

新页面文案加到 `packages/client/src/i18n/{en,zh}.json`，namespace：`auth.*` / `hero.*` / `leaderboard.*` / `me.*`。所有新文案中英对照。

### 6.9 取舍

- 不用 React Router data loader，继续 hook 式 fetch
- Login 不做密码强度条、邮箱验证提示、双因素
- Avatar 第一版不做上传；email 用户用首字母圆圈占位
- Me 页轻量（Hero 已展示核心数据，Me 只做明细）

## 7. 测试策略

### 7.1 分层

| 层 | 工具 | 新增内容 |
|---|---|---|
| Game logic | 现有 vitest + GameTestHarness | 无（引擎不变） |
| Server integration | 新增 vitest in `packages/server/__tests__` | 测试 DB 用 `new PGlite('memory://')` |
| E2E | 现有 Playwright | 1 条 `login → claim → play → 看到积分` 冒烟 |

### 7.2 关键用例

- 游客连赢 3 局 → 登录 → ledger 3 条 user_id 填充、guest_id 清空、user.claimed_guest_id 有值
- guest X 已被 user A 合并 → user B 尝试合并 → 409，ledger 不变
- 同一 UTC 日两次 session 激活 → 只写一条 daily_checkin
- bot 用 revoked token → 401
- 服务器重启后，bot 用持久 token 仍能连
- Socket.io 握手伪装别人的 userId → 断连

### 7.3 不测试

- BetterAuth 自身功能（signup 校验、rate limit 等）
- 首页视觉回归（改版进行中无意义）

## 8. 实施顺序

每阶段独立 mergeable，上下游解耦。

| # | PR | 内容 | 估 |
|---|---|---|---|
| 0 | `feat(db): migrate SQLite→PGlite` | better-sqlite3 → PGlite，drizzle dialect 切 pg-core，schema 重写，docker volume | 1d |
| 1 | `feat(server): persist bot_tokens` | bot_tokens 表，TokenStore 内部换 DB，hash 存储 | 0.5d |
| 2 | `feat(server): integrate BetterAuth` | better-auth 装接入，lib/auth.ts，GitHub env，挂 /api/auth/*，sessionMiddleware | 1d |
| 3 | `feat(client): login/register pages` | /login /register，authClient，useSession，UserChip；**暂不接 claim** | 1d |
| 4 | `feat(points): ledger + APIs + claim-guest` | points_ledger，GameRoom 写入，/api/me，/api/guest/:id/points，/api/me/claim-guest，接上登录触发 | 1.5d |
| 5 | `feat(ui): lobby redesign (phase-2 layout)` | Lobby 重做：HeroGuest/LoggedIn、ActiveRoomsRow、RecentlyPlayedRow、AllGamesSection（精选 6-8 + View all） | 1.5d |
| 6 | `feat(ui): view-all pages + leaderboard` | /games、/rooms、/leaderboard 三页 + LeaderboardRow，/api/leaderboard 实现 | 1d |
| 7 | `feat(ui): me page + daily checkin auto` | /me 页，daily-checkin auto-trigger，i18n 补齐 zh | 0.5d |
| 8 | `chore: e2e + polish` | Playwright 用例，375px 调整，空状态文案，错误边界 | 0.5d |

**总估**：~8-9 天工时。

## 9. 部署与回滚

### 9.1 部署

- docker-compose: server 加 `volumes: [./pgdata:/app/pgdata]`
- `.env`: 新增 `BETTER_AUTH_SECRET`（32+ 字符）、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`
- Seoul 服务器无需开新端口（PGlite 进程内）
- 启动 drizzle `migrate()` 自动跑

### 9.2 GitHub OAuth 一次性配置

`{BETTER_AUTH_URL}/api/auth/callback/github` 填到 GitHub OAuth App。阶段 2 PR 附部署文档；local dev 先用邮箱密码验证。

### 9.3 回滚

- 不可逆只有 3 件：阶段 0（DB 换）、阶段 2（BetterAuth 表）、阶段 4（ledger）。都是新增不是删除。
- 回滚到阶段 0 之前 = 回 SQLite，期间 ledger 数据丢失（第一版可接受）。

## 10. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| PGlite 生产稳定性 | 中 | 中 | 监控 pgdata 体积；迁真 PG 只改 DATABASE_URL |
| 游客合并争抢 | 低 | 低 | claimed_guest_id unique + 事务天然防 |
| GitHub OAuth 首次配置错 | 高 | 中 | PR 附部署文档；dev 先走 email/pw |
| Socket.io 身份伪装 | 低 | 高 | 握手二次校验 |
| 老 bot token 失效 | 确定 | 低 | PR 说明，CLI 无改动，admin 重签 |

## 11. 开放问题（可在实施中决策）

- 积分具体分值（win/draw/daily_checkin）是否要运营调整接口 — 第一版硬编码在 `lib/points.ts` 常量
- Me 页"最近 20 条 ledger 时间线"是否需要筛选/分页 — 按需再加
- `/rooms` 页房间列表是否做实时刷新（polling/websocket push） — 第一版 30s 轮询起步
