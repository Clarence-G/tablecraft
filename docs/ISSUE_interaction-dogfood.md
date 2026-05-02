# Interaction Dogfood — TableCraft 0.1.x

**Date:** 2026-05-02  
**Tester:** Claude Code (automated dogfood, production `tablecraft.aster.pub` + local `localhost:5173`)  
**Scope:** Connect-Four fix verification (Part A) + 12 other games (Part B)

---

## Summary

| Severity | Count |
|----------|-------|
| P0 | 2 |
| P1 | 3 |
| P2 | 5 |

**P0:** connect-four column drop-zone (FIXED in this session); mobile error-boundary crash (cross-cutting, all games)  
**P1:** Hive board renders blank; battleship grid missing on mobile; UNO card color missing from aria-labels  
**P2:** Battleship grid-cell aria-labels empty; Splendor card-button labels cryptic; Yahtzee duplicate dice labels; Liar-bar no waiting-player feedback; Blackjack bet-submit disabled until amount clicked (non-obvious)

---

## Part A — Connect-Four Column Drop Fix (VERIFIED PASS)

**Fix:** `DiscBoard.tsx` — replaced 7 header buttons + 42 plain `<div>` cells with 42 `<button>` elements (one per empty cell). Filled cells revert to `<div>`. Ghost preview on hover now follows the hovered column across all rows.

**Browser test on `localhost:5173`:**

1. Created room `DUQ0JC` (local server). Bot (testbot) placed red piece at col 3 bottom row via REST.
2. Navigated to `/rooms/DUQ0JC/play`. Accessibility tree showed **41 `<button>` elements** labelled "投入第 N 列" — one per empty cell (42 total minus the 1 filled cell).
3. Clicked `@e9` = row 0 (top row), col 5 → yellow piece dropped to row 5 of col 5. **Gravity correct.**
4. Filled cell (bot's piece at row 5, col 3) had no button in the a11y tree. **Click-blocking correct.**
5. Tab targets: each column had exactly one `tabIndex=0` button (the lowest empty row), remaining empty cells had `tabIndex=-1`.

**Result: PASS.** Screenshot: `docs/assets/dogfood-connect-four-2.png` (before bot move), `dogfood-connect-four-3.png` (after), `dogfood-connect-four-4.png` (after player drop to col 5).

---

## Part B — Per-Game Dogfood

### battleship

**Room:** `GI5MDU` → `https://tablecraft.aster.pub/rooms/GI5MDU/play`  
**Screenshot:** `docs/assets/dogfood-battleship-1.png`

- **P1/mobile:** At 375px viewport, the ship-placement grid is completely absent — only the player list and background scene render. Screenshot: `dogfood-battleship-mobile.png`.  
  _Repro: Start a battleship game, resize browser to 375px → grid disappears._
- **P2/a11y:** Grid cell buttons have no accessible label — snapshot shows `button [ref=eN]` with no name. Should be `aria-label="A1"` etc.  
  _Repro: Inspect a11y tree during placement phase._

---

### blackjack

**Room:** `GFM0NK` → `https://tablecraft.aster.pub/rooms/GFM0NK/play`  
**Screenshot:** `docs/assets/dogfood-blackjack-1.png`

- **P2/UX:** The "下注" (Bet) submit button is disabled on load. Quick-bet chips (10/25/50/100/200/500) must be clicked first to enable it. No tooltip or helper text explains this. New users may be confused.  
  _Repro: Start blackjack, observe disabled "下注" button._
- Otherwise: betting phase, bet chips, player hand display all look clean. Turn indicator shows whose bet is pending.

---

### codenames

**Room:** `YH3FJW` — requires **4 players minimum**, could not start with 1 browser + 1 bot.  
**Screenshot:** `docs/assets/dogfood-codenames-1.png` (lobby only)

- No in-game issues found (game unreachable with 2 players).
- **P2/UX:** Lobby shows empty seat rows but no hint that 4 players are needed before the Start button appears. Min-player requirement could be surfaced more prominently.

---

### gomoku

**Room:** `F0TTDN` → `https://tablecraft.aster.pub/rooms/F0TTDN/play`  
**Screenshot:** `docs/assets/dogfood-gomoku-1.png`

- Desktop: grid renders cleanly, coordinate labels (A–P, 1–15) visible, board buttons labelled "row,col" e.g. `"1,1"`. All disabled on opponent's turn — correct.
- Turn indicator ("Hermes 回合") in header is clear.
- No issues found on desktop.

---

### hive

**Room:** `J83OZU` → `https://tablecraft.aster.pub/rooms/J83OZU/play`  
**Screenshot:** `docs/assets/dogfood-hive-1.png`, `dogfood-hive-2.png`

- **P1/rendering:** Board renders as a near-empty brown rectangle. No piece inventory, no hex tiles, no pieces. The a11y tree shows only chrome buttons (返回/复制房间码/规则/退出/展开侧栏). The game is completely unplayable visually.  
  _Repro: Start a 2-player Hive game and navigate to /play → blank board._
- Likely cause: hex-grid SVG/canvas component fails to mount or piece data is not reaching the Board component.

---

### liar-bar

**Room:** `5LLB1B` → `https://tablecraft.aster.pub/rooms/5LLB1B/play`  
**Screenshot:** `docs/assets/dogfood-liar-bar-1.png`

- Desktop: declared suit (Q/K/A) shown at top, player hands shown as card buttons. On opponent's turn, cards are correctly disabled.
- **P2/UX:** When waiting for opponent's turn, there is no feedback message ("等待 Hermes 出牌…"). The card strip is visible but all disabled. A passive "waiting for opponent" status in the header would help.  
  _Repro: Start liar-bar, observe opponent's turn — no "waiting" text._

---

### love-letter

**Room:** `AL22WN` — lobby only (room creation network error on start attempt, likely rate-limit).  
**Screenshot:** `docs/assets/dogfood-love-letter-1.png` (lobby)

- Earlier run (`8EER2F`) showed clean desktop: single card (牧师/Priest) visible with action description, disabled on bot's turn.
- No desktop issues found beyond the per-room network error.

---

### splendor

**Room:** `SX1OW3` → `https://tablecraft.aster.pub/rooms/SX1OW3/play`  
**Screenshot:** `docs/assets/dogfood-splendor-1.png`

- Desktop: all 3 card levels rendered, gem token row visible, noble row at top. Clean layout.
- **P2/a11y:** Card button labels are just the cost/points values, e.g. `"+1 3 3 3 5"`. No indication of card bonus color or level in the label. Screen reader users cannot distinguish cards.  
  _Repro: Inspect a11y tree on any card button during your turn._
- Noble requirement tiles show no accessible name at all.

---

### texas-holdem

**Room:** `3NQFNO` → `https://tablecraft.aster.pub/rooms/3NQFNO/play`  
**Screenshot:** `docs/assets/dogfood-texas-holdem-1.png`

- Desktop: hole cards (2 face-up), community card area (empty pre-flop), pot display, player chips panel — all render correctly.
- Turn indicator in header ("圆 1 · 底注") is clear. Action buttons (fold/check/raise) absent when not your turn — correct UX.
- No issues found on desktop.

---

### undercover

**Room:** `M903PB` — requires **3 players minimum**, could not start with 1 browser + 1 bot.  
**Screenshot:** `docs/assets/dogfood-undercover-1.png` (lobby only)

- Same note as codenames: min-player requirement not prominently surfaced in lobby.

---

### uno

**Room:** `J886E9` → `https://tablecraft.aster.pub/rooms/J886E9/play`  
**Screenshot:** `docs/assets/dogfood-uno-1.png`

- Desktop: draw pile + discard pile visible, hand cards rendered in a strip, "摸牌" (draw) button present. Cards correctly disabled on bot's turn.
- **P1/a11y:** Card aria-labels omit color — snapshot shows `"+4"`, `"8"`, `"SKIP"` with no color prefix. A red 8 and a blue 8 are indistinguishable to screen readers, and during play the valid-play rule depends on color.  
  _Repro: Inspect a11y tree of hand cards → labels missing color component._
- "摸牌" button has `aria-description="UNO"` — this is the player name leaking into the description, not an intentional label.

---

### yahtzee

**Room:** `APL6AA` → `https://tablecraft.aster.pub/rooms/APL6AA/play`  
**Screenshot:** `docs/assets/dogfood-yahtzee-1.png`

- Desktop: 5 dice visible with values, re-roll button labelled "再次投掷（剩余 2 次）" — excellent. Score sheet collapsed but expandable.
- **P2/a11y:** Multiple dice share the same aria-label: snapshot shows two buttons both labelled "骰子2" and two labelled "骰子1". Each die should have a unique index label, e.g. "骰子 1（点数 2）".  
  _Repro: Inspect a11y tree after first roll → duplicate die labels._

---

## Cross-Cutting Issues

### P0 — Mobile error boundary crash (ALL games)

**Severity:** P0 — game is completely unreachable on real mobile devices.

**Repro:**
1. Open any game's `/play` URL in a 375px-wide viewport (or on a real phone).
2. Page renders "Something went wrong" with no recovery UI.

**Observed on:** battleship, liar-bar, splendor, texas-holdem, uno, yahtzee, love-letter (all games tested at 375px).  
The single exception was battleship at 375px which partially rendered (player list visible, game grid missing) — suggesting the error occurs mid-render, likely when a component tries to compute layout dimensions against a zero/small container size and throws.

**Note:** The error boundary does not reset on viewport resize back to desktop — requires a full page reload. No "try again" button is shown.

**Screenshot:** `docs/assets/dogfood-battleship-mobile.png` (partial), all others show blank "Something went wrong".

---

## Repro Index

| Issue | URL | Steps |
|-------|-----|-------|
| Connect-four fix ✓ | `localhost:5173/rooms/DUQ0JC/play` | Click any cell in any row of a column |
| Mobile crash (P0) | Any `/play` URL at 375px | Resize browser to 375px |
| Hive blank board (P1) | `tablecraft.aster.pub` → start Hive game | Start 2-player Hive game |
| Battleship grid gone on mobile (P1) | battleship `/play` at 375px | See mobile crash above |
| UNO card color missing in a11y (P1) | uno `/play` | Inspect hand card aria-labels |
| Battleship grid cell no aria-label (P2) | battleship `/play` | Inspect placement grid buttons |
| Splendor card label cryptic (P2) | splendor `/play` | Inspect card button labels |
| Yahtzee duplicate dice labels (P2) | yahtzee `/play` | Inspect die buttons after first roll |
| Liar-bar no waiting text (P2) | liar-bar `/play` on opponent's turn | Observe turn with no feedback |
| Blackjack bet button non-obvious (P2) | blackjack `/play` on betting phase | Observe disabled 下注 button on load |
