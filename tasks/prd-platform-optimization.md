# PRD: TableCraft 平台综合优化

## 1. Introduction / Overview

本 PRD 汇总一批用户提出的平台级和游戏级优化项，涵盖三类改动：

1. **架构通用**（所有游戏共享）：通用房间选项（可调 `maxPlayers`、按游戏的自定义选项）、结算界面统一改版（积分 + 回房间/回大厅）、**跨房间 notifications 泄漏 bug 修复**、共享卡牌组件包 `@repo/card-ui`。
2. **游戏独立**：battleship 增加快速模式 + 异形战舰；undercover 增加回合揭露/多轮；UNO 增加 +4 质疑规则；liar-bar 说谎被抓后重置牌局；yahtzee 修复查看他人计分表后自己计分表清空的 bug。
3. **UI / 动画视觉优化**：9 个游戏的视觉改进，每项都需要**截图 Review**（使用 widget-screenshot 或 agent-browser 技能，对比前后视觉差异后由我确认）。

**根因已排查的 bug（写入 PRD 前已验证）**
- 四子棋日志出现 blackjack 的 `log.bet/log.deal/log.hit/log.stand/log.bust`：`GameStore` 在 `App` 根部挂载（`packages/client/src/App.tsx:43`），`socket` 生命周期内常驻；`notifications` 数组**跨房间累积**，从未在离开/加入房间时清空（`packages/client/src/hooks/useGame.ts:73-79`）。`GameLogProvider` 的 `qualifyMessageKey`（`packages/game-ui/src/log/GameLogContext.tsx:38-43`）把没带 namespace 的 `log.bet` 加上当前房间的 `connect-four:` 前缀，于是上一局 blackjack 的历史日志就以 `connect-four:log.bet` 的形式被渲染出来。

## 2. Goals

- 修复 notifications 跨房间泄漏（零测试遗漏，Connect Four/Blackjack 回归用例）。
- 引入统一的**通用房间选项**系统：`maxPlayers` 可在房间内实时调整；各游戏可声明自己的选项 schema（battleship 的快速模式、异形战舰；undercover 的回合数；UNO 的 +4 质疑开关）。
- 结算界面统一为「积分 +XX / 回到房间 / 回到大厅」，不做积分持久化，只用现有排名规则 × UI 升级。
- 抽出 `@repo/card-ui` 共享扑克组件，Blackjack / 德州 / 骗子酒馆 / 情书 / UNO 统一卡面、卡背、Joker 风格。
- 9 个游戏的 UI/动画视觉优化，每项交付前**必须**提供截图 Review 并由我确认。
- Biome 零报错、`pnpm typecheck` 零错误、所有受影响包的 vitest 全绿。

## 3. Scope & Execution Principles

- **截图 Review 为硬性门槛**：凡 UI/动画类 US，提交前必须用 widget-screenshot 或 agent-browser 捕获**改动前 + 改动后**两张截图，贴在 PR 描述里等我确认后再合并。
- **架构先行**：US-001 ~ US-005（架构通用）原则上先做，后续游戏级 US 复用。
- **禁止扩大范围**：本 PRD 不处理未列出的游戏或未列出的问题。
- **375px 必测**：所有 UI 改动必须同时验证 375px 和桌面端。
- **设计 Token**：禁止硬编码颜色，所有改动走 `@repo/game-ui` token 体系。
- **无 emoji**：代码、日志、文档一律不使用 emoji。

---

## 4. User Stories — 架构通用

### US-001: 修复 notifications 跨房间泄漏

**Description:** 作为玩家，我在上一局 Blackjack 结束后进入 Connect Four 房间，不应该看到历史的 `log.bet / log.deal / log.hit / log.stand / log.bust` 日志。

**根因：** `packages/client/src/hooks/useGame.ts` 的 `GameStore` 在 `App.tsx:43` 挂载后与 socket 生命周期绑定；`notifications` 数组在 `game:notify` 事件里只追加（line 73-79），**离开房间/进入新房间时从未清空**。`GameLogProvider` 的 `qualifyMessageKey`（`packages/game-ui/src/log/GameLogContext.tsx:38-43`）在渲染时给裸 key 套上当前游戏 namespace，于是旧日志以 `connect-four:log.bet` 的形式泄漏出来。`GameLogProvider` 自身的 `seenNotifications` WeakSet 只能阻止同一会话内重复 ingest，不能阻止跨房间累积。

**Acceptance Criteria:**
- [ ] `GameStore` 新增 `resetForRoom()` 方法，清空 `notifications`、`authoritativeState`、`optimisticView`、`lastReject`、`matchStartedAt`。
- [ ] 在 `room:join` 成功回调或 `useGame` 监听到 `room.roomId` 变化时调用 `resetForRoom()`（择一，首选在 `useRoom` 的 join 成功回调里）。
- [ ] `GameLogProvider` 在 `defaultNs` 变化时主动 `clear()`（也就是切换游戏时清空日志面板）。
- [ ] 新增回归测试：`useGame.test.ts` 中模拟「blackjack 房间发 5 条 notify → 离开 → 加入 connect-four 房间 → `notifications` 长度为 0」。
- [ ] 新增 E2E-lite 测试（`GameLogProvider.test.tsx`）：`defaultNs` 从 `blackjack` 切到 `connect-four` 后 `entries` 为空。
- [ ] Typecheck passes，`pnpm --filter @repo/client test` 和 `pnpm --filter @repo/game-ui test` 全绿。
- [ ] Verify in browser: 连续玩完 Blackjack → 退出 → 进入 Connect Four，日志面板为空。

### US-002: 通用房间选项系统（可调 maxPlayers + 每游戏自定义选项）

**Description:** 作为房主，我需要在房间设置里实时调整最大人数（不再强制 `meta.maxPlayers`），并且不同游戏可以注入自己的选项（Battleship 的快速模式/异形战舰、Undercover 的回合数、UNO 的 +4 质疑开关）。

**Acceptance Criteria:**
- [ ] `GameMeta` 新增可选字段 `configSchema?: z.ZodObject<any>` 和 `defaultConfig?: T`，各游戏在 `shared.ts` 声明。
- [ ] `RoomState` 新增 `maxPlayers: number`（覆盖 `meta.maxPlayers` 的默认值）和 `config: T`（游戏自定义选项）。
- [ ] 新增 socket 事件 `room:updateOptions`，房主可调：`{ maxPlayers?: number, config?: Partial<T> }`。服务器验证后广播 `room:updated`。
- [ ] `room:join` / `RoomManager.findAvailableRoom` 使用 `room.maxPlayers`，不再使用 `meta.maxPlayers`。
- [ ] 客户端新增 `<RoomOptionsPanel>`（`packages/client/src/components/room/RoomOptionsPanel.tsx`），在房间等待阶段显示；非房主只读。
- [ ] `RoomOptionsPanel` 渲染通用区（maxPlayers stepper，范围 `meta.minPlayers ~ meta.maxPlayers`）+ 游戏自定义区（由游戏注入的 React 组件或从 `configSchema` 自动生成）。
- [ ] 服务器侧在 `game:start` 时把 `room.config` 传入 `logic.setup`，接口 `GameContext` 新增 `config: T` 字段。
- [ ] 新增测试：`GameRoom.test.ts` 验证 `maxPlayers` 动态调整、超出范围拒绝、开始游戏后不可改。
- [ ] Typecheck passes，`pnpm --filter @repo/server test` 和客户端测试全绿。
- [ ] **Verify in browser with screenshots: RoomOptionsPanel 的 375px 和桌面端各一张截图，我确认后合并。**

### US-003: 结算界面展示积分 +XX / 回房间 / 回大厅（复用现有系统）

**Description:** 平台**已经有完整积分+排行榜系统**（`packages/server/src/lib/points.ts` 定义 `{ win:10, draw:3, loss:0, daily_checkin:5 }`；`ledger.ts` 写 DB；`GameOverModal` 已有 `onReturnToRoom`/`onReturnToLobby` props；`PointsBadge` 组件已存在；`packages/client/src/hooks/usePoints.ts` 提供客户端积分读取）。本 US **不新建积分规则**，只做三件事：(1) 修平局积分未记录的 bug；(2) 把 "+XX" 显示到 `GameOverModal`；(3) 补齐所有游戏的 `onReturnToRoom` / `onReturnToLobby` 回调 + `room:restart` 后端事件。

**Acceptance Criteria:**

**(a) 服务端：修平局记录 + 暴露本局积分变化**

- [ ] `packages/server/src/engine/GameRoom.ts:555` 的 `writePointsLedger(rankings)` 改造：当前只写 `win`（首位）和 `loss`（其余）；新增可选参数 `ties?: string[][]`（游戏 logic 结束时传入「并列组」），并列第一名全部按 `draw` 记录。若 logic 未传 `ties`，保持现状。
- [ ] 新增 socket 事件 `game:over`，payload 包含 `{ rankings, pointsDelta: Record<playerId, number> }`。`pointsDelta[pid]` = `POINTS[recordedReason]`。
- [ ] 新增 `GameRoom.test.ts` 用例：
  - 无 ties 的 `['A','B']` → A:win(+10), B:loss(0)，`pointsDelta` 对应。
  - `ties=[['A','B']]` → A:draw(+3), B:draw(+3)。
- [ ] 平局文案 i18n：`game-ui:draw`（中文「平局」/英文「Draw」）若缺失补上。

**(b) 客户端：GameOverModal 展示 +XX 与总积分**

- [ ] `@repo/game-ui/feedback/GameOverModal.tsx` 新增可选 prop `pointsDelta?: Record<string, number>`；排名每行右侧用 `<PointsBadge label="+" points={pointsDelta[pid] ?? 0} />`。
- [ ] 顶部标题下方用 `<Stat>` + `<PointsBadge>` 组合展示「本局 +{myDelta}」，其下一行展示「总积分 {total}」（total 用 `usePoints()` 读取，hook 路径 `packages/client/src/hooks/usePoints.ts`）。
- [ ] 当本局玩家属于并列第一时，标题区域显示「平局」图标（使用 lucide `Handshake` 或 `Equal`，不用 `Trophy/Frown`）。
- [ ] 新增 `GameOverModal.test.tsx` 用例覆盖 `pointsDelta` 展示、平局态、`onReturnToRoom`/`onReturnToLobby` 回调触发。

**(c) 各游戏 Board.tsx 补齐回调 + room:restart**

- [ ] 在 `BoardProps<TView, TAction>`（`@repo/shared`）新增可选字段：`onReturnToRoom?: () => void`、`onReturnToLobby?: () => void`、`pointsDelta?: Record<string, number>`。
- [ ] `Game.tsx:116-124` 将三者下发给 Board；`onReturnToRoom` = `() => socket.emit('room:restart')`；`onReturnToLobby` 复用现有 prop。
- [ ] 下列游戏的 `<GameOverModal />` 调用点 forward 这三个 prop（定位已在 grep 结果中）：`undercover:240`、`texas-holdem:527`、`connect-four:84/91`、`liar-bar:332`、`battleship:532`、`blackjack:421`、`love-letter:383`、`uno:556`、`hive:467`、`yahtzee:740`、`splendor:959`、`gomoku:247`、`codenames:322`，以及 `werewolf`（若有 Modal 调用点）。
- [ ] 服务器新增 `room:restart` 事件处理（`packages/server/src/socket/handlers.ts`）：仅房主可触发；保留玩家清单 + `maxPlayers` + `config`，重新 `logic.setup`，广播新 `game:state`；非房主点按钮则广播「请求重开」chat/notify，UI 提示等待房主。
- [ ] 非房主点击「回到房间」按钮时文案切换为「等待房主重开」并禁用。
- [ ] Typecheck passes，所有游戏包 test 全绿。
- [ ] **Verify in browser with screenshots: 胜利 / 失败 / 平局 × 房主 / 非房主 的典型组合截图；375px + 桌面端。**

<!-- 以下段落为历史草稿，已被上面的内容取代：

**Description:** 作为玩家，游戏结束时我要看到「你赢了 / 你输了 / 平局」+「积分 +XX」+「回到房间 / 回到大厅」两个按钮，而不是现在各游戏独立、风格不一的结算弹窗。

**积分规则（无持久化，仅本局展示）：** 按名次分：
- 2 人游戏：赢 +10，平 +3，输 0。
- N 人游戏（N ≥ 3）：按名次线性分配 `[10, 7, 5, 3, 2, 1, 1, ...]`（不足补 0），平局并列则取平均。
- 规则放在 `packages/shared/src/scoring.ts`，可被 `GameOverModal` 调用。

**Acceptance Criteria:**
- [ ] `@repo/game-ui/feedback` 的 `GameOverModal` 新增 props：`ranks: Array<{ playerId: string; rank: number }>`、`onBackToRoom: () => void`、`onBackToLobby: () => void`。
- [ ] Modal 布局：标题（你赢了/输了/平局）→ 积分 +XX（从 ranks 计算）→ 两个按钮（回房间、回大厅）。
- [ ] `packages/shared/src/scoring.ts` 导出 `computePoints(ranks, playerId)`；含单元测试。
- [ ] 所有游戏的 `Board.tsx` 改造：结束时传 `ranks` 给 `GameOverModal`；目前硬编码 winner/loser 文案的游戏全部迁移（至少：battleship、connect-four、gomoku、hive、liar-bar、love-letter、undercover、uno、yahtzee、blackjack、texas-holdem、splendor、codenames、werewolf）。
- [ ] 「回到房间」重置为等待阶段（同一房间、同一玩家、开始新一局）；「回到大厅」调 `roomCtx.leave()` + `navigate('/')`。
- [ ] 服务器新增 `room:restart` 事件：房主点「回到房间」后，`GameRoom` 保留玩家清单，重新 `setup`。
- [ ] Typecheck passes，所有游戏包 test 全绿。
- [ ] **Verify in browser with screenshots: 2 人胜利、3 人并列、平局 三种情况截图；375px + 桌面端。**
-->

### US-004: 共享卡牌组件包 `@repo/card-ui`

**Description:** 作为开发者，我需要一套统一的扑克牌组件（PlayingCard / CardBack / Joker），让 Blackjack、Texas Holdem、Liar Bar、Love Letter、UNO 都复用同一视觉语言。

**Acceptance Criteria:**
- [ ] 新建 `packages/card-ui/`，`package.json` 名为 `@repo/card-ui`，导出 `PlayingCard`、`CardBack`、`JokerCard`、`CardHand`（扇形手牌容器）。
- [ ] `PlayingCard` 支持：`suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'`、`rank: 'A' | '2' | ... | 'K'`、`size: 'sm' | 'md' | 'lg'`、`faceDown: boolean`、`selected: boolean`。
- [ ] 使用 SVG 花色 + 艺术化衬线字体（Playfair Display 或 Cinzel，自举到 packages/game-ui 字体系统）。
- [ ] `CardBack` 统一背面花纹（菱形网格 + 品牌色边框，skeuomorphic）；`JokerCard` 重绘 Joker 人像（扁平剪影，非卡通）。
- [ ] 迁移顺序（每个游戏一个子 US）：Blackjack → Texas Holdem → Liar Bar → Love Letter → UNO。UNO 仅用 CardBack 统一，牌面本身保留颜色数字（特殊卡）。
- [ ] 选中动画：`selected` → `translateY(-12px)` + shadow；再点一次复位。禁止同时 hover 动画 + selected 动画冲突（即 hover 在未 selected 时才生效）。
- [ ] 单元测试：`pnpm --filter @repo/card-ui test` 覆盖所有变体。
- [ ] Typecheck passes。
- [ ] **Verify in browser with screenshots: 每种牌面（A-K × 4 花色 + Joker + 卡背）× size（sm/md/lg）的总览截图；以及 5 个游戏迁移前后对比图。**

### US-005: 通用房间选项 i18n + 文档

**Description:** 作为玩家，房间选项（maxPlayers、各游戏自定义）需要中英文文案；作为开发者，新游戏接入时要知道如何声明选项。

**Acceptance Criteria:**
- [ ] `packages/client/src/i18n/` 的 common 资源新增 `room.options.maxPlayers`、`room.options.save`、`room.options.restoreDefaults`、`room.options.onlyHostCanEdit` 等 key（中英双语）。
- [ ] 各游戏 `i18n/*.json` 新增 `options.*` 段（battleship 的 fastMode / irregularShips；undercover 的 rounds；UNO 的 drawFourChallenge）。
- [ ] `CLAUDE.md` 第 6 节「Adding a New Game」补充「声明 configSchema / defaultConfig / options i18n」的说明。
- [ ] Typecheck passes，i18n key 缺失告警为 0。

---

## 5. User Stories — Battleship

### US-006: 修复字体可读性 + 选中战舰的预览跳变

**Description:** 深蓝色背景上部分文字（坐标标签、状态提示）几乎看不清；选中战舰时画面中间会突然插入一条预览条，造成布局跳变。

**Acceptance Criteria:**
- [ ] 检查 `games/battleship/Board.tsx` 所有 `text-*` 类，把对比度不足的替换为 token（`text-primary-foreground` / `text-muted-foreground`），禁止硬编码 `#` 色值。
- [ ] 选中战舰预览条从「中间插入」改为「侧边固定位置」（桌面：棋盘右侧；375px：棋盘下方固定高度，不挤压棋盘）。
- [ ] 未选中战舰时预览区保留占位（`visibility: hidden` 或固定 min-height），避免布局跳变。
- [ ] Typecheck passes，`pnpm --filter @games/battleship test` 全绿。
- [ ] **Verify in browser with screenshots: 改动前后各 4 张（桌面/375px × 未选中/已选中）。**

### US-007: Battleship 快速模式（每回合 5 次攻击）

**Description:** 房主可在房间选项里开启快速模式，开启后每回合每人可发射 5 次攻击（命中不额外奖励，发完即换手）。

**Acceptance Criteria:**
- [ ] `games/battleship/shared.ts` 的 `configSchema` 新增 `fastMode: z.boolean().default(false)`。
- [ ] `logic.ts` 读取 `ctx.config.fastMode`：若为 `true`，玩家一回合内允许提交 5 次 `FIRE` action，第 5 次后自动 `SET_TIMER` 切换到对手；少于 5 次也可提交 `END_TURN`（新动作）。
- [ ] `Board.tsx` 显示当前回合剩余攻击次数（UI token 化）。
- [ ] 新增 `logic.test.ts` 用例：快速模式下 5 次 FIRE 切手；标准模式下 1 次 FIRE 切手。
- [ ] `i18n/en.json` + `zh.json` 新增 `options.fastMode`、`shotsRemaining`。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 快速模式开启时棋盘 HUD 显示剩余攻击数。**

### US-008: Battleship 异形战舰（U 型 / Z 型）

**Description:** 房主可在房间选项里开启异形战舰；开启后舰队包含 U 型（5 格）、Z 型（5 格）等非直线舰。

**Acceptance Criteria:**
- [ ] `games/battleship/shared.ts` 的 `configSchema` 新增 `irregularShips: z.boolean().default(false)`。`irregularShips` 与「传统模式」完全并列——开启后**所有舰都是异形**，关闭即原直线舰队。
- [ ] `logic.ts` 新增 `SHIP_SHAPES` 常量：相对坐标集合描述每种形状。初版至少覆盖 U、Z、L、T、十字、S，总数 ≥ 5（保证能组一支异形舰队），单元格总数分布与原直线舰队大致相当（2+3+3+4+5 或类似 17 格）。
- [ ] `logic.setup` 根据 `ctx.config.irregularShips` 选择舰队：
  - 关闭（默认）：现行直线舰队（5 艘直线，总 17 格）。
  - 开启：舰队全部来自 `SHIP_SHAPES`，**无直线舰**；数量与总格数保持不变（建议 5 艘异形，总 17 格，由形状池挑出）。
- [ ] 摆放阶段支持旋转（4 向）+ 镜像，格子校验允许非矩形形状。
- [ ] 新增测试：
  - 异形舰在边界/重叠时的 place 校验。
  - 异形舰命中判定（部分格中弹不算沉没）、沉没判定（所有格中弹即沉没）。
  - `irregularShips=true` 时舰队中**没有直线舰**。
  - `irregularShips=false` 时保持原直线舰队（回归测试）。
- [ ] Board.tsx 摆放面板展示异形舰预览图（SVG）；房间选项面板用图例明确「传统 / 异形」两种模式并列。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 房间选项里「传统 / 异形」两种模式的舰队预览对比图；摆放阶段异形舰旋转+镜像的四态截图；实战中异形舰命中/沉没动画。**

---

## 6. User Stories — Connect Four

### US-009: 拟真棋盘与棋子

**Description:** 当前棋子只占孔洞 1/2 半径，视觉很丑；我要立体木质棋盘 + 红/黄厚实棋子。

**Acceptance Criteria:**
- [ ] 棋盘：木纹背板（SVG 滤镜或预生成 PNG，放 `packages/client/public/game-assets/connect-four/`），孔洞内缘有阴影。
- [ ] 棋子：填满孔洞 ~95%，红色/黄色渐变 + 内阴影 + 高光点（CSS 或 SVG）。
- [ ] 落子动画：从顶部下落到目标行，`cubic-bezier` 回弹（已有动画保留，只改视觉）。
- [ ] 禁止使用 emoji；禁止硬编码颜色（棋子色从 tokens 取 `--piece-red` / `--piece-yellow`，在 `packages/game-ui` 注册）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 空棋盘、一方领先、获胜高亮 三张截图；375px + 桌面端。**

---

## 7. User Stories — Gomoku（五子棋）

### US-010: 修复落子动画抖动 + 滚动条跳顶

**Description:** 点击落子后棋子有左右忽闪的诡异动画；每次落子都把页面滚动条拉到顶部。

**Acceptance Criteria:**
- [ ] 定位 `games/gomoku/Board.tsx` 落子动画：如果是 CSS transition 源于 transform，排查是否重复触发；做不好就**删除动画**，直接出现即可。
- [ ] 排查滚动跳顶根因：大概率是 `window.scrollTo(0,0)` 或某个 focus 导致，或 `key` 重置组件。修复后页面滚动位置在落子前后保持不变。
- [ ] 新增测试（React Testing Library）：落子后 `window.scrollY` 不变。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 滚动到页面中部落子，前后位置保持一致（录屏或两张截图对比）。**

---

## 8. User Stories — HIVE

### US-011: HIVE 视觉与规则完善

**Description:** 多个问题合并：(1) 莫名弹出「取消选择」按钮；(2) 白方手牌区白图标看不清；(3) 规则描述过度简略；(4) 棋盘复用背景色，无边界感。

**Acceptance Criteria:**
- [ ] 删除无理由弹出的「取消选择」弹层；若需要取消选择，改为点击空白处或棋子本身取消（无额外 UI）。
- [ ] 白方手牌区底色改为浅木色（非白），或白棋子加深色描边（`stroke`）；确保与黑棋子对比度 ≥ 4.5:1。
- [ ] `games/hive/i18n/en.json` 和 `zh.json` 的 `rules` 补全每类棋子的移动规则（蜂后：相邻一格；甲虫：相邻一格可叠加；蜘蛛：必须移动 3 格；蚂蚁：任意格；蚱蜢：跳过直线上连续棋子；含「一体性」规则）。
- [ ] 棋盘背景和页面背景区分：棋盘用 `bg-card` 或木纹纹理，外层用 `bg-background`，边界用 thick brown border（skeuomorphic，对齐 DESIGN.md）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 白方手牌、黑方手牌、棋盘整体、规则弹窗 四张截图；375px + 桌面端。**

---

## 9. User Stories — Liar Bar（骗子酒馆）

### US-012: 卡牌视觉统一到 `@repo/card-ui`

**Description:** 卡牌太丑；Joker 丑爆了；卡背和 Blackjack/德州不一致。

**Acceptance Criteria:**
- [ ] 依赖 US-004 完成后，迁移 `games/liar-bar/Board.tsx` 手牌到 `PlayingCard` + `JokerCard` + `CardBack`。
- [ ] 手牌 hover 动画：未选中时 `translateY(-6px)`；选中时 `translateY(-12px)` + shadow；再点复位（明确分离，不重叠）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 手牌默认/hover/选中 三态截图；Joker 单独特写。**

### US-013: 「本轮宣告牌型 X」UI 重排

**Description:** 当前宣告文案横贯全屏，占用过多空间。

**Acceptance Criteria:**
- [ ] 宣告牌型改为放在右侧边栏（桌面）或顶部小徽章（375px），不再横贯全屏。
- [ ] 使用 token（`bg-card` + `border-primary` + `text-primary-foreground`）。
- [ ] **Verify in browser with screenshots: 375px + 桌面各一张。**

### US-014: 说谎被抓后重置牌局

**Description:** 当前我说谎被抓时，牌局状态没有重置，产生 bug。

**Acceptance Criteria:**
- [ ] `games/liar-bar/logic.ts` 的 `CHALLENGE` 分支：无论说谎方是挑战者还是被挑战者，结算开枪后**必须**重新发牌，重置 `claimedRank`、`pile`、`hands`、`turn`。
- [ ] 新增 `logic.test.ts` 用例：玩家 A 说谎被 B 抓 → A 开枪 → 下一轮 `hands` 已重发，`pile` 为空。
- [ ] Typecheck + test 全绿。

### US-015: 扣动扳机的动画与特效

**Description:** 当前开枪纯文字太直白，希望有转动左轮 + 开枪的视觉焦点。

**Acceptance Criteria:**
- [ ] 新增 `<RevolverAnimation>` 组件（`games/liar-bar/RevolverAnimation.tsx`）：SVG 左轮 → 转动（CSS keyframes，~600ms）→ 闪光 + 枪声（可选音频，默认关闭）。
- [ ] 开枪结果（命中/空响）通过动画最后一帧的颜色/符号展示，随后弹出结果文字。
- [ ] 动画可被 `prefers-reduced-motion` 关闭（退化为简单闪烁）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots or recording: 转动 → 开枪 → 结果 的连续截图。**

---

## 10. User Stories — Love Letter（情书）

### US-016: 规则完善 + 出牌记录显示昵称 + 艺术字体 + 视觉动画优化

**Description:** 多个问题合并：(1) 规则过于简略；(2) 出牌记录显示玩家 ID 而非昵称；(3) 卡牌文字希望更艺术化；(4) 整体 UI/动画过度直白。

**Acceptance Criteria:**
- [ ] `games/love-letter/i18n/*.json` 的 `rules` 补全每张牌的效果（卫兵、牧师、男爵、侍女、王子、国王、伯爵夫人、公主），含数字序号和交互规则。
- [ ] 出牌记录渲染：将 `actorId` 映射为 `playerNames[actorId]`（从 `GameLogProvider` 的 `playerNames` 取；目前应该只需在 Board 内 join `players` prop）。
- [ ] 卡牌文字字体改用艺术化衬线（Cinzel / Cormorant Garamond），通过 `@repo/card-ui` 的字体 token 统一加载。
- [ ] 出牌动画：`translateY + rotate` + fade 到弃牌堆；抽牌动画从牌堆滑出。
- [ ] 使用 `@repo/card-ui` 的 `PlayingCard`（若不适合 Love Letter 的异形牌面，至少统一卡背和角徽位置）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 规则弹窗、出牌记录（含昵称）、出牌动画中帧、抽牌动画中帧。**

---

## 11. User Stories — Undercover（谁是卧底）

### US-017: 回合揭露 + 多轮 + 房间选项设置

**Description:** 当前没有回合揭露环节、没有回合数，直接结束；希望加入回合数设置 + 每回合揭露发言 → 投票 → 淘汰。

**Acceptance Criteria:**
- [ ] `games/undercover/shared.ts` 的 `configSchema` 新增 `maxRounds: z.number().int().min(1).max(10).default(3)`。
- [ ] `logic.ts` 改造为多轮结构：每轮包含「发言 → 投票 → 淘汰 → 揭露」四个阶段；回合数达到 `maxRounds` 或卧底/平民全被淘汰时结束。
- [ ] 新增揭露阶段 UI：被淘汰者的身份（卧底/平民）公开展示，持续 3 秒后进入下一轮。
- [ ] `Board.tsx` UI 适度优化：发言阶段玩家头像高亮，投票阶段投票条可视化，揭露阶段用卡片翻转动画。
- [ ] 房间选项里加 `maxRounds` slider（1~10）。
- [ ] 新增测试：多轮推进、达到 `maxRounds` 后结束、平民优先淘汰卧底也结束。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 发言/投票/揭露 三阶段截图 × 375px + 桌面端；房间选项面板截图。**

---

## 12. User Stories — UNO

### US-018: 手牌折叠动画修复 + +4 质疑规则 + 木质背景 + 牌桌区分 + 基础动画

**Description:** 多问题合并：(1) 手牌一会合起一会散开；(2) +4 需要质疑规则；(3) 背景惨红色太丑改木质；(4) 牌桌和背景要有区别；(5) 全局缺少动画。

**Acceptance Criteria:**
- [ ] 手牌渲染用 `@repo/card-ui` 的 `CardHand`，固定扇形布局（`transform: rotate + translateY`），禁止随 hover 重排；hover 仅抬起**单张**。
- [ ] +4 质疑：出 +4 时下家可选「接受 / 质疑」。质疑成功（上家手里还有匹配颜色）→ 上家摸 4，质疑失败 → 下家摸 6。
  - `logic.ts` 新增 action `CHALLENGE_DRAW_FOUR`；新增状态 `awaitingChallenge`。
  - 新增测试：成功/失败/超时自动接受三种路径。
- [ ] 背景改木质纹理（复用 connect-four 同款或引入 `bg-wood-dark` token）；牌桌用更深色 felt 纹理（`bg-felt-green`），中心摆放区再加 inset shadow。
- [ ] 全局动画：出牌（滑动到弃牌堆 + 翻面）、摸牌（从牌堆扇出到手牌）、换向（方向箭头脉冲）、跳过（玩家头像灰化闪烁）。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 背景 + 牌桌对比、手牌默认/hover 态、+4 质疑弹窗、出牌动画中帧。**

---

## 13. User Stories — Yahtzee（快艇骰子）

### US-019: 修复看他人计分表后自己清空 bug + 简化背景

**Description:** (1) 查看别人计分表后自己计分表直接空了；(2) 笔记本质感横线和计分表横线杂糅。

**Acceptance Criteria:**
- [ ] 定位 `games/yahtzee/Board.tsx` 查看他人计分表的状态管理：大概率是 `selectedPlayer` 切换后渲染的 scoreSheet 源自错误的 state 字段；修复后切回自己时 scoreSheet 恢复。
- [ ] 新增测试：切换 `selectedPlayer` 到他人再切回自己，`scoreSheet` 保持完整。
- [ ] 背景去掉横线条纹（保留纸张质感但改为 flat `bg-card` 或细微噪点），避免与计分表横线冲突。
- [ ] Typecheck + test 全绿。
- [ ] **Verify in browser with screenshots: 查看他人 → 切回自己 两张截图；简化后背景截图。**

---

## 14. Functional Requirements（汇总）

- FR-1: `GameStore` 新增 `resetForRoom()`，并在 `room:join` 成功回调中调用。
- FR-2: `GameLogProvider` 在 `defaultNs` 变化时自动 `clear()`。
- FR-3: `RoomState.maxPlayers` 和 `RoomState.config` 成为房间级别字段，`maxPlayers` 可实时调整。
- FR-4: `GameMeta.configSchema` + `defaultConfig` 为可选字段；`GameContext.config` 传入 `logic.setup` / `onAction`。
- FR-5: socket 新增 `room:updateOptions`、`room:restart` 事件。
- FR-6: `@repo/card-ui` 导出 `PlayingCard` / `CardBack` / `JokerCard` / `CardHand`。
- FR-7: `GameOverModal` 新增可选 prop `pointsDelta`，在排名行展示 `<PointsBadge label="+" />`；`onReturnToRoom`/`onReturnToLobby` 已存在，本 PRD 只做补齐调用。
- FR-8: **积分系统复用现有**：规则在 `packages/server/src/lib/points.ts`（win:10/draw:3/loss:0），账本在 `ledger.ts` + `pointsLedger` 表，排行榜 API 在 `packages/server/src/api/points.ts`；本 PRD 仅修 `GameRoom.writePointsLedger` 的平局未记录 bug，并通过新 socket 事件 `game:over` 暴露本局 `pointsDelta` 给前端。
- FR-9: Battleship 支持 `fastMode` 和 `irregularShips` 两个 config；Undercover 支持 `maxRounds`；UNO 支持 `drawFourChallenge`（默认开启）。
- FR-10: Liar Bar 说谎被抓后必须重发牌；开枪必须经过转动动画。
- FR-11: Love Letter 出牌记录显示 playerName 而非 playerId。
- FR-12: 所有硬编码颜色迁移为 token；所有 UI 必须通过 375px 和桌面端测试。

---

## 15. Non-Goals (Out of Scope)

- **不**做积分持久化、不做天梯、不做账号系统改造。
- **不**引入真实货币、不做付费内容。
- **不**改造未在本 PRD 提及的游戏（Splendor / Codenames / Werewolf / Texas Holdem / Blackjack 仅在 US-004 的卡牌迁移内被涉及）。
- **不**做多语言扩展（仅中英）。
- **不**引入新的游戏。
- **不**修改引擎层 `GameLogic` 接口以外的结构（`GameContext.config` 是受控扩展，不打破现有游戏）。
- **不**在本 PRD 内做服务器鉴权/防作弊改造。

---

## 16. Technical Considerations

- `GameStore` 的生命周期改造要小心：现状是 socket 生命周期，改为房间生命周期需在 `useRoom` 回调里显式 `resetForRoom()`，而不是销毁整个 store（否则会断开 socket 监听）。
- `configSchema` 用 Zod；服务器需在 `room:updateOptions` 时 `schema.safeParse`，失败返回错误。
- `@repo/card-ui` 的字体加载走 `@fontsource/*`（和已有 `packages/game-ui` 字体加载方式一致，避免 FOUT）。
- 异形战舰的形状定义要支持旋转（0/90/180/270）和镜像（horizontal flip）；建议用「相对坐标集合」数据结构，在 place/render 时统一做变换。
- Liar Bar 左轮动画要尊重 `prefers-reduced-motion`。
- 所有截图 Review 使用 **widget-screenshot** 技能或 **agent-browser** 技能在本地 dev 服务器上抓取，PR 描述必须贴出图片链接；我在 PR 上确认后才 merge。

---

## 17. Success Metrics

- 四子棋跨房间日志泄漏 0 例（靠自动化测试 + 手工回归）。
- `pnpm biome check` 0 error；`pnpm typecheck` 0 error；所有游戏包 vitest 100% pass。
- 9 个游戏的 UI 截图 Review 均由我确认通过。
- 房间选项面板在 375px 不出现布局溢出。
- 结算界面在所有游戏行为一致（同样的 3 按钮、同样的积分展示）。

---

## 18. Open Questions（已全部确认，仅留存档）

1. 房主离线时，`maxPlayers` 调整权限是否移交给下一个玩家？——**不移交**，非房主只读。
2. `room:restart` 后 UI 是否保留上一局 +N tooltip？——**不保留**，每局独立。
3. UNO +4 质疑规则？——**按 UNO 官方**：仅手里无合法牌时才可出 +4，否则质疑成功 → 出牌者摸 4，质疑失败 → 质疑者摸 6。
4. `@repo/card-ui` 的 Joker 风格？——**古典宫廷**。
5. 异形战舰形状集合？——**异形模式下全部为异形（不与直线并列混编）**；形状池包含 U / Z / L / T / 十字 / S 等 ≥ 5 种；「传统模式（全直线）」和「异形模式（全异形）」在房间选项里并列二选一。已反映到 US-008。
6. 平局在 `rankings` 中的表达？——**候选 A**：新增可选 `ties?: string[][]`，兼容现有游戏。
7. 积分系统？——**复用现有**（`packages/server/src/lib/points.ts` + `pointsLedger` 表 + `api/points.ts` + `game-ui/leaderboard`）。



---

## 19. 执行建议（供 Ralph / 人工执行）

推荐顺序（每个 story 完成 → typecheck → test → 截图 Review → 我确认 → merge）：

1. US-001（bug fix，先止血）
2. US-002 + US-005（通用房间选项，架构基座）
3. US-003（结算界面，依赖 US-002 的 `room:restart`）
4. US-004（`@repo/card-ui` 包，基座）
5. 并行推进：
   - US-006、US-007、US-008（Battleship）
   - US-009（Connect Four）
   - US-010（Gomoku）
   - US-011（HIVE）
   - US-012、US-013、US-014、US-015（Liar Bar）
   - US-016（Love Letter）
   - US-017（Undercover）
   - US-018（UNO）
   - US-019（Yahtzee）

所有 UI 类 US 的最后一步都是「提交截图等我确认」，未确认前不合并。


