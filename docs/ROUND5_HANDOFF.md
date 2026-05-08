# Round 5 TableCraft UI Review — 会话交接

**Last updated**: 2026-05-07 ~16:20 (session restart 前)
**Working branch**: `main` (clean since commit `acf478f`)

## 📍 当前状态（已完成）

### Pipeline 搭建 ✅
- `scripts/shoot-waiting.ts` 增加了 `--ingame` flag 并跑通
- **核心修复**：`startGame` API 必须在 `page.goto()` **之前**调用（不是之后）——否则 client socket 收不到 playing 事件，永远卡 Loading。顺序：host join → bots join → bots ready → host ready → API start → 再 browser goto
- 使用方式：
  ```bash
  cd ~/Projects/tablecraft
  zsh -c 'source ~/.zshenv && OUT_DIR=.ui-review/r5-ingame tsx scripts/shoot-waiting.ts --ingame'
  ```

### 截图产出 ✅
- `.ui-review/r5/` —— 30 张 waiting-room 截图（13 games × 2 viewports + lobby/games-list × 2）
- `.ui-review/r5-ingame/` —— 30 张 ingame 截图，全绿无 ERROR

### Vision 审查 ✅
已用 3 个并发 subagent 过全部 desktop 图 + 4 张关键 mobile 图，findings 如下。

---

## 🔴 HIGH 优先 findings（Stage A 快速查证）

**前置过滤**：截图里所有 `Host-{gameId}-{hash}` / `Bot1-{gameId}-{hash}` 玩家名是我的 `shoot-waiting.ts` 脚本造的**测试 artifact**，不是 UI bug。subagent 多处把这个当问题报，忽略。

### 1. **Undercover 角色词泄漏怀疑** ⚠️
- vision 说 "player display names include the role word (`-undercover-`)"
- **强烈怀疑是误判**——`-undercover-` 是 gameId 后缀不是角色词
- **待查**：`packages/client/src/games/undercover/Board.tsx` 看玩家名显示路径是否确实用内部 userId；若是则验证它是否拼了真实 secret word

### 2. **Yahtzee 右侧 active player panel 可能错**
- vision 说 "shows Bot1 stats while it's Host's turn"
- **待查**：`packages/client/src/games/yahtzee/Board.tsx` current-player 选择逻辑

### 3. **Codenames setup 阶段倒计时跑**
- vision 说 "Countdown timer (00:03) actively running on pre-game setup/lobby screen"
- **待查**：codenames game-state machine，setup 阶段应不应该有 turn timer

### 4. **Love-letter `移除::` 双冒号 typo**
- **待查**：`packages/client/src/games/love-letter/Board.tsx` 约 line 200 附近（Round 4 加的 `t('removedLabel')`）；或 locale files 里搜 `移除`

### 5. **Splendor mobile clips gem tokens**
- subagent 说 "Bot1 name and rightmost noble clipped at viewport edge no scroll affordance"
- **待查**：`packages/client/src/games/splendor/Board.tsx` mobile 响应式断点

---

## 🟡 MED findings（confirm 后再修）

- **Battleship dark-navy 面板 vs 暖 palette 冲突** — 架构决策（scene token 保留？）
- **UNO 黄色卡看像橙色** — Round 3 可能保留了不合理的 hex
- **Connect-four turn dot 琥珀色 vs 红棋子** — 状态色不匹配
- **Hive 空棋盘无 placement guide**
- **Mobile 顶栏 icon 普遍 32-36px < 44px**（可能有意紧凑）
- **Love-letter 手牌 description clip**

## 🟢 LOW（defer 或不动）

- 全站"你的回合"重复（顶栏 + 玩家卡）—— 冗余但非 bug
- 红色退出按钮 vs 暖 palette —— warning semantic color 跨站一致
- texas-holdem 完全无 issue ✅

---

## 🎯 下一步计划（重启后按顺序）

### Stage A —— 快速查证（10-15min，全 read-only）
- [ ] 查 undercover 玩家名显示代码，确认是不是真 leak
- [ ] 查 love-letter 是否真有 `::` 双冒号 typo
- [ ] 查 codenames setup 阶段是否真有 timer 运行

### Stage B —— 确认后修复（30min）
- [ ] Yahtzee current-player panel 逻辑
- [ ] 确认的 Stage A 问题
- [ ] Love-letter 手牌 description clip（若是 CSS）

### Stage C —— 架构讨论
- [ ] Battleship dark-navy 是否要 migrate
- [ ] 全站 "你的回合" dedup 策略
- [ ] Mobile 顶栏 icon 44px vs 紧凑取舍

### 收尾
- [ ] `scripts/shoot-waiting.ts` + `.ui-review/r5*` commit（infra 改善）
- [ ] 考虑是否把 ingame pipeline 写进 skill（`tablecraft-ui-review-pipeline`）

---

## 🔑 关键文件/位置

```
scripts/shoot-waiting.ts          # 188+ 行 ingame-capable 截图脚本
.ui-review/r5/                    # 30 张 waiting-room 截图
.ui-review/r5-ingame/             # 30 张 ingame 截图
docs/ROUND5_HANDOFF.md            # 本文件
docs/UI_REVIEW_ROUND2_FINDINGS.md # 上轮 findings 参考
```

## 🧷 环境 reminder
- `pnpm dev` on :3001 (server) + :5173 (client) 必须跑
- 运行 tsx 脚本必须 `zsh -c 'source ~/.zshenv && ...'`（gateway 环境）
- monorepo patch tool 在 `packages/server/**/*.ts` 会刷假 tsc errors —— 2 次以上切 write_file
- Screenshots 的 `Host-{gameId}-{hash}` 玩家名是**测试 artifact** 不是 UI bug

## 📎 未 commit 的 dirty files
```
scripts/shoot-waiting.ts          # 新增，198 行
.ui-review/r5/                    # 30 张 waiting PNG
.ui-review/r5-ingame/             # 30 张 ingame PNG
docs/ROUND5_HANDOFF.md            # 本文件
```
