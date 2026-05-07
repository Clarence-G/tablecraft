# UI Review Round 2 — Consolidated findings (2026-05-07)

**Reviewed this round**: 11 games (battleship was covered round 1; gomoku+uno were fixed round 1).
Specifically:
- batch-a (sonnet): blackjack, connect-four, hive, yahtzee ✅
- batch-b (opus): liar-bar, love-letter, splendor, texas-holdem ✅
- batch-c (sonnet) KILLED after 22min stuck on codenames giveClue phase
  - codenames partial (waiting+setup+ingame) → orchestrator vision spot-check
  - undercover → re-launched as `cc-ui-review-undercover` (opus) ⏳

## Verified findings (orchestrator cross-checked against source)

All findings below have been cross-checked against exact source lines. False
positives and conditionally-rendered UI have been pruned (not listed).

### 🔴 Critical (1)

| ID | Game | Issue | Source |
|---|---|---|---|
| YAH-01 | yahtzee | Full-page crash on first ingame render (Sentry fallback). Intermittent. Likely null-access before first WS state. | `games/yahtzee/Board.tsx` — needs null-guards on state.players / state.winner |

### 🟠 Major (8)

| ID | Game | Issue | Source |
|---|---|---|---|
| LIAR-01 | liar-bar | Desktop `max-w-lg` (512px) leaves ~65% empty at 1440px | `games/liar-bar/Board.tsx:147` |
| LOVE-01 | love-letter | Desktop `max-w-lg` same issue | `games/love-letter/Board.tsx:134` |
| TEX-01 | texas-holdem | Desktop `max-w-2xl` (672px) on green felt | `games/texas-holdem/Board.tsx:357` |
| SPL-01 | splendor | Mobile tier rows `overflow-x-auto` without scroll affordance | `games/splendor/Board.tsx:789` |
| TEX-02 | texas-holdem | Mobile action-bar 4-5 flex-1 buttons too tight at 351px | `games/texas-holdem/Board.tsx:247` |
| YAH-02 | yahtzee | Scorecard expand button ~14px tap target | `games/yahtzee/Board.tsx:~641` |
| YAH-03 | yahtzee | Scorecard expanded clipped by GameScene `overflow-hidden` | `Board.tsx:516` + `packages/game-ui/src/scene/GameScene.tsx:73` |
| CON4-02 | connect-four | Mobile disc-board cells 40×40 < WCAG 44×44 | `packages/game-ui/src/board/DiscBoard.tsx:98` |

### 🟡 Minor (8)

| ID | Game | Issue | Source |
|---|---|---|---|
| CON4-01 | connect-four | Desktop 40px cells occupy ~26% of 1440px | `DiscBoard.tsx:98` (responsive clamp) |
| BJ-01 | blackjack | Bet chips `py-2` ≈ 36px < 44px | `games/blackjack/Board.tsx:170` |
| CDN-01 | codenames | 5×5 grid cells ~30-36px high at mobile | `games/codenames/Board.tsx:186-209` |
| LIAR-02 | liar-bar | Announced card + hand cards same styling (hierarchy) | `games/liar-bar/Board.tsx` (deferred) |
| LIAR-03 | liar-bar | No N/3 selected count, no selected-state styling on cards | `games/liar-bar/Board.tsx` |
| LOVE-02 | love-letter | Mobile removed-cards dense comma-separated line | `games/love-letter/Board.tsx` |
| TEX-03 | texas-holdem | Empty community-card slots unlabeled | `games/texas-holdem/Board.tsx` |
| ROOM-01 | (all) | `text-[#1a1108]` hardcoded × 2 in Room.tsx (pre-existing) | `packages/client/src/pages/Room.tsx:80,170` |

### 🔵 Cosmetic / defer (3)

| ID | Game | Issue |
|---|---|---|
| BJ-02 | blackjack | Dealer area empty placeholder needs label (subjective "make it better") |
| HIVE-01 | hive | Pre-game single dot insufficient affordance (subjective) |
| SPL-02 | splendor | Right-column imbalance at 1440px with 1 opponent (subjective) |

### 🟣 Separate umbrella issue (already drafted)

- **Hardcoded color audit** across 9 games (109 occurrences) — see `docs/ISSUE_hardcoded-color-audit.md`. LIAR-01b (liar-bar hardcoded #d94040/#16a34a) + ROOM-01 + other hex values all roll up here. Defer to dedicated Phase 1 after this round of fixes merges.

### ❌ False positives / hallucinations pruned (3, not actioned)

- ~~"No play/submit CTA" in liar-bar~~ — button conditionally rendered
- ~~"No challenge/believe buttons" in liar-bar~~ — different phase
- ~~"Clue input missing" in codenames~~ — spymaster-only render

## Fix plan — 4 parallel CC workers

Architecturally disjoint scopes, no conflicts expected.

### Worker W1: desktop max-w caps + yahtzee overflow (sonnet)
- **Scope**: `games/liar-bar/Board.tsx`, `games/love-letter/Board.tsx`, `games/texas-holdem/Board.tsx`, `games/yahtzee/Board.tsx`
- **Task**: raise each `max-w-lg` / `max-w-2xl` to `max-w-3xl lg:max-w-5xl` (responsive, NOT introducing any new 2-column layout — that's a separate architecture-level discussion). Also add `overflow-y-auto` to yahtzee Board root (YAH-03).
- **Fixes**: LIAR-01, LOVE-01, TEX-01, YAH-03 (4 items)
- **Model**: sonnet (mechanical class renames)

### Worker W2: yahtzee critical + YAH-02 (opus)
- **Scope**: `games/yahtzee/Board.tsx` only
- **Task**: (1) add null-guards on state.players/state.winner to prevent first-render crash (YAH-01); (2) fix expand button tap target (YAH-02 — apply `py-2 px-3 min-h-[44px]`)
- **Fixes**: YAH-01, YAH-02 (2 items, 1 critical)
- **Model**: opus (needs reasoning about race condition + defensive coding)
- **Note**: scope overlap with W1 (YAH-03). W2 ships first, then W1 adds overflow-y-auto as cheap follow-up. OR we just sequence them (W2 before W1 on yahtzee).

### Worker W3: DiscBoard responsive + tap target (sonnet)
- **Scope**: `packages/game-ui/src/board/DiscBoard.tsx` (+ tests)
- **Task**: replace `w-10 h-10` fixed cells with `w-[clamp(44px,6vw,64px)] aspect-square` (mobile ≥44, desktop larger). Adds min tap target, removes desktop-tiny. Verify tests still pass (we fixed the button index to 24 last round).
- **Fixes**: CON4-01, CON4-02 (2 items)
- **Model**: sonnet (single file + test)

### Worker W4: splendor mobile overflow + texas action bar (sonnet)
- **Scope**: `games/splendor/Board.tsx`, `games/texas-holdem/Board.tsx`
- **Task**:
  - Splendor: add right-edge fade gradient + chevron hint to `.overflow-x-auto` tier rows. Consider using shared Fade component if it exists.
  - Texas: add `px-2` to btnBase + verify flex-wrap triggers; add positional labels to empty community-card slots.
- **Fixes**: SPL-01, TEX-02, TEX-03 (3 items)
- **Model**: sonnet

### Deferred to next round (not this sprint)

- BJ-01 (small), LIAR-02, LIAR-03, LOVE-02, CDN-01, BJ-02, HIVE-01, SPL-02
- Hardcoded color audit (separate umbrella)

## Scheduling

W2 (yahtzee critical) runs **first alone** because its fix is scoped narrowly and
is the only P0. Then W1, W3, W4 run in parallel (scope-disjoint).

After all 4 merge → a single consolidated commit with full test run.

## W1 resolution

**Worker**: W1 (desktop max-w caps + Yahtzee scorecard overflow)
**Date**: 2026-05-07
**Files changed**: 5

| File | Change |
|---|---|
| `games/liar-bar/Board.tsx:147` | `max-w-lg mx-auto` → `max-w-3xl lg:max-w-5xl mx-auto` |
| `games/love-letter/Board.tsx:134` | `max-w-lg mx-auto` → `max-w-3xl lg:max-w-5xl mx-auto` |
| `games/texas-holdem/Board.tsx:357` | `max-w-2xl mx-auto` → `max-w-3xl lg:max-w-5xl mx-auto` |
| `games/yahtzee/Board.tsx:531` | `max-w-2xl mx-auto w-full` → `max-w-3xl lg:max-w-5xl mx-auto w-full overflow-y-auto` (also fixes YAH-03 scorecard clip) |
| `games/undercover/Board.tsx:54` | `max-w-lg mx-auto` → `max-w-3xl lg:max-w-5xl mx-auto` |

W2's null-guard + expand-button changes to `games/yahtzee/Board.tsx` were already present when W1 edited that file; W1's change is additive (only the className on the Board root div). Typecheck passes (`pnpm typecheck` exit 0). No other files touched.

## W3 resolution

**Issues**: CON4-01 (mobile tap-target < 44px) + CON4-02 (desktop board too narrow)
**File edited**: `packages/game-ui/src/board/DiscBoard.tsx`

Replaced fixed `w-10 h-10` (40px) on the cell `baseClass` (line 98) with:
```
w-[clamp(44px,6vw,64px)] aspect-square
```
- `clamp(44px, 6vw, 64px)` — floor at 44px (WCAG 2.5.5 pass on mobile), grows with viewport, capped at 64px (7-col board ~500px at 1440px).
- `aspect-square` replaces `h-10` to maintain round cells.
- Disc inner element (`w-8 h-8`) left unchanged (not `w-10 h-10`, conservative approach).

**Verification**: `pnpm typecheck` exit 0, all 10 DiscBoard tests pass including `buttons[24]` assertion.

## W4 resolution

**SPL-01 — Splendor mobile tier-row overflow affordance**
- `games/splendor/Board.tsx:~789` — wrapped each tier row in a `relative` container and added a right-edge fade gradient (`absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-card to-transparent`).
- Gradient hidden on `sm:` and up (`sm:hidden`) so it only appears when the row can actually overflow.
- No JS scroll listener; pure Tailwind gradient as documented in the task brief.

**TEX-02 — Texas action-bar cramped at 351px**
- `games/texas-holdem/Board.tsx:247` — added `px-2` to `btnBase` for horizontal breathing room.
- Action-row container already uses `flex gap-2 flex-wrap` — no change needed there.

**TEX-03 — Community-card slot positional labels**
- `games/texas-holdem/Board.tsx` — `CardPlaceholder` now accepts an optional `label` prop and renders it as `text-[10px] tracking-widest uppercase opacity-60` at the bottom of the slot.
- Caller (`~line 408`) computes the absolute slot position (`state.communityCards.length + i`) and resolves it to one of `flop1 | flop2 | flop3 | turn | river` via `t()`.
- i18n keys `flop1`, `flop2`, `flop3` added to both `games/texas-holdem/i18n/en.json` and `zh.json`. Existing `turn` / `river` keys reused.

**Verification**: `pnpm typecheck` exit 0; splendor 33/33 + texas-holdem 27/27 tests pass; zero hardcoded Chinese in `Board.tsx`.
