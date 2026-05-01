# Stage 3 Visual UI Review

**Date:** 2026-05-02 (dev server @ localhost:5173)
**Reviewer:** 小柚 via vision-AI + DOM inspection
**Scope:** Stage 3 deliverables — Lobby FriendsTab, 围观 (Spectate) CTA, `/rooms/:id/watch` SpectatorView

---

## 🚨 Critical Functional Bugs (block Stage 3 "Done" claim)

### Bug #1 — `/watch` route immediately redirects to `/play` when roomCtx has state
**Severity:** P0 (spectate完全不可用)
**Root cause:** `packages/client/src/App.tsx:81-87` — URL-sync `useEffect` matches any `/rooms/:id*` path and redirects to `/play` or `/` based on `roomStatus`, ignoring the `/watch` suffix.
**Status:** ✅ **已修** (this session). Added `if (path.endsWith('/watch')) return;` guard before redirect.
**Files:** `packages/client/src/App.tsx`

### Bug #2 — SpectatorView renders player UI, not spectator UI
**Severity:** P0 (观战者被当成玩家)
**Root cause:** SpectatorView passes `isSpectator` prop to `<Board>`, but **no game's Board implementation consumes the prop**. Verification:
```
rg -l 'isSpectator' packages/ games/
# → only SpectatorView.tsx and shared/src/types/board.ts (declaration)
# → ZERO game Board implementations read the flag
```
**Evidence:** navigating to `/rooms/TDTUW5/watch` for a Battleship room renders "部署你的舰队" setup phase + interactive ship buttons + "确认部署 (0/5)" CTA — as if the spectator is the host.
**Scope to fix:** 13 game Boards need spectator-mode handling:
1. Suppress interactive controls (action buttons, drag/drop targets, card clicks) when `isSpectator`
2. Hide setup-phase UI (e.g. Battleship ship-placement panel) entirely
3. Add a visible "围观中 / SPECTATING" banner/badge
4. Render a neutral seat view (not first-player's perspective by default)

**Status:** ⏳ Unfixed. Needs per-game patches + a shared `<SpectatorBanner>` component.
**Worker gap:** Stage 3-A prompt said "pass `isSpectator=true` flag to hide interactive controls" but didn't enumerate each game's Board. The worker stopped at the prop-passing layer.

### Bug #3 — SpectatorView uses `defaultValue:` fallback, violating i18n hard rule
**Severity:** P1 (i18n 硬规矩)
**Location:** `packages/client/src/pages/SpectatorView.tsx:89-90`
```tsx
const localizedName = t(`${roomState.gameId}:name`, { defaultValue: meta.name });
const rulesText = t(`${roomState.gameId}:rules`, { defaultValue: '' });
```
Project memory: "用户 TableCraft 项目对 i18n 要求严格：所有面向用户的字符串必须走 i18n locale 文件，禁止硬编码中文/英文 UI 文案——包括 `t(key, { defaultValue: '中文' })` 的中文 fallback"
**Note:** `meta.name` 通常是英文，可能算边界情况，但仍违反 "default value 不允许" 的硬规则。`defaultValue: ''` 尤其应该用明确的 i18n key（如 `game.noRules`）。
**Status:** ⏳ Unfixed.

---

## 🎨 Lobby 主页 UI Issues

### P0 — "围观" (Spectate) button visual weight mismatches "加入" (Join)
- Join = dark filled (orange/brown solid), primary weight
- Spectate = light outlined ghost, tertiary weight
- Result: spectate CTA looks like secondary/ignorable action, 5 spectate buttons visually bleed into noise
- **Fix:** align on one style system — either both filled with different hues, or both outlined with distinct accent colors

### P0 — 房间卡片 "主持人" 字段为空
- Snapshot shows: `TDTUW5 战舰 主持人 2/2 围观` — "主持人" label with no name after it
- Looks like a partially-loaded or broken state
- **Likely cause:** Stage 3 added `RoomSummary.status` field, but `hostName` might be absent for guest-hosted rooms or not wired in the card
- **Fix:** either always show hostName (fall back to gameId seat 0) or drop the "主持人:" label entirely for unnamed hosts

### P1 — SidePanel tab label 竖排两字可读性差
- "排行榜", "好友", "个人", "最近" tabs render as 2-row stacked chinese characters in the tab bar, cramped
- Below them, period pills (总榜/周榜/日榜) are horizontal → mixed-orientation feels incoherent
- **Fix:** widen panel OR use icons only + tooltip OR use single-line tab with smaller font

### P1 — "进行中的房间" horizontal scroll list cut off
- 5th card is visually clipped at right edge
- No gradient/arrow hint that list scrolls
- **Fix:** add right-edge fade (`bg-gradient-to-l from-cream`) + cursor/drag affordance

### P2 — Game category pills 色彩过于多元
- 策略=blue, 卡牌=purple, 棋类=green, 休闲=red, 派对=orange → 5+ hues fighting editorial restraint
- **Fix:** consolidate to 2-3 tones or a single accent color

### P2 — 顶栏品牌 "TableCraft" 居中
- Left half 空旷 → 视觉不平衡，与常规 web nav 习惯不符
- **Fix:** left-align brand, keep language/auth on right

### P3 — 用户名 "熊猫WCKq" random suffix
- Breaks the warm editorial feel (looks like test-account noise)
- **Fix:** drop the 4-char suffix for display, keep it only for internal id

### P3 — 排行榜空态过于单薄
- "暂无排名数据" + "查看完整榜单" with lots of empty space
- **Fix:** add a tiny illustration or "玩一局就能上榜" copy

---

## 🎨 好友 Tab (Guest Empty State)

### P0 — Empty state lacks CTA button
- Currently: only "登录后查看好友" text + friends icon
- No in-panel login button — user has to hunt for global login
- **Fix:** add primary 登录 button beneath the text

### P1 — Panel content vertically centered → huge vertical whitespace
- Icon + one line of text sit mid-panel; panel height is full-viewport
- Looks spacious in a bad way
- **Fix:** anchor empty state ~1/3 from top, not centered

### P2 — Copy 温度 inconsistent with main area
- Lobby hero uses "你好，熊猫XXX"/"登录保存你的战绩" (warm)
- Friends panel: "登录后查看好友" (flat/cold)
- **Fix:** rewrite as "登录后和好友一起开黑" or similar warm copy

### P2 — Guest search input is hidden (cannot verify visual parity)
- Search box only renders after login; couldn't compare to lobby's "房间码" input style
- **To check post-login:** ensure same background, border-radius, border color, placeholder hue

---

## ✅ What's Working

- All 13 game board screenshots regenerated successfully (`pnpm tsx scripts/shoot-games.ts` → 13/13). Stage 3 didn't regress board rendering.
- SidePanel 4-tab (排行榜/好友/个人/最近) layout loads cleanly, icons render, period pills work.
- "围观" i18n key (`lobby.room.spectate`) resolves to 围观 correctly in zh.
- warm cream theme stays consistent across all views.
- typecheck + `pnpm test` (530/530) + i18n parity (159=159) all green.

---

## 🎯 Recommended Fix Priority

| # | Severity | Issue | Est. Effort |
|---|---|---|---|
| 1 | P0 | ~~`/watch` redirects to `/play`~~ (✅ fixed this session) | Done |
| 2 | P0 | SpectatorView renders player UI (需 13 game Boards 都支持 isSpectator + shared SpectatorBanner) | **Large (1-2h)** |
| 3 | P0 | Spectate vs Join button style mismatch | Small (15min) |
| 4 | P0 | Room card "主持人" empty field | Small (10min) |
| 5 | P0 | Friends empty-state CTA button | Small (10min) |
| 6 | P1 | SidePanel tab vertical cramping | Medium (30min) |
| 7 | P1 | SpectatorView `defaultValue:` i18n violation | Small (5min) |
| 8 | P2 | Horizontal scroll clipping | Small (10min) |
| 9 | P2 | Category pill color consolidation | Medium (30min) |

**Reco:** 先修 #2-7（P0/P1 一把过），#8-9 视情况补。然后重跑 screenshot + vision pass 确认。

---

## Files Touched This Session

- `packages/client/src/App.tsx` — guard `/watch` route from URL-sync redirect
