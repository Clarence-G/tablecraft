# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a focused QA + bug-fix task with a complete spec below. Skip clarifying questions — read code + browser, make fixes, verify.

# Interaction Dogfood + Connect-Four Drop-Zone Bug

You are a bug-fix + QA worker on TableCraft. Two concrete deliverables, in order:

## Part A — MUST FIX: Connect-Four column drop-zone bug (P0)

**User report (ground truth):**
> 四子棋 理论上一列都可以点。

**Expected UX:** In Connect Four, every cell in a column should accept a click — clicking ANY empty cell in column N drops a piece into column N (which then gravity-settles to the lowest available row). This is how physical Connect Four works and how every reputable digital version renders it: the "drop" gesture is per-column, and the whole column is a click target (not just a header button or the bottom empty row).

**Current state (likely broken):** Only one drop affordance per column — maybe a header button, the top-empty row, or a single "drop here" zone. User wants the entire column (all 6 cells) clickable.

**Your job:**

1. Read the connect-four Board component. Start from: `packages/client/src/components/Board.tsx` (or equivalent) or search `rg -l "connect-four|connectFour|ConnectFour" packages/` — it's plausibly under `games/connect-four/client/` or `packages/game-ui/src/games/connect-four/`. Also check `packages/shared/src/games/connect-four/` for the `drop` action type.

2. Understand the current click-target rendering. Specifically:
   - What element has the onClick handler that dispatches the drop?
   - Is it bound per column (7 buttons) or per cell (42 buttons)?
   - If per-cell, does it correctly compute `col = cellIndex % 7` and submit `{type:'drop', col}` regardless of which row was clicked?

3. **Implement: every empty cell in column `c` should trigger a drop into column `c`.** Filled cells (already have a piece) must NOT be clickable — hover should do nothing and cursor should stay default. Only cells in a column with at least one empty slot should be clickable (if a column is full, whole column inert).

4. **Hover feedback:** when hovering over any empty cell in column `c`, highlight the ENTIRE column's empty cells subtly (e.g. faint glow on the would-be landing cell at the bottom, or a vertical highlight strip) — so the user gets the "dropping a piece into this column" affordance from any Y position.

5. **Preserve existing winner-line highlight** (the diagonal/row/col streak when someone wins). Your hover state must not fight with it.

6. **Accessibility:** each clickable cell must still be a real `<button>` with an accessible name like `aria-label="Drop into column 3"`. Filled cells become `aria-disabled` and non-focusable. Keyboard nav: Tab cycles through column 1..7 (one focus target per column is fine, doesn't need 42 tab stops — pick the lowest empty cell in each column as the focus target).

7. **Verify visually** via browser. Start dev server if needed (`pnpm dev` — server on :3001, client on :5173). Navigate to a test room in Connect Four, attempt to drop by clicking:
   - Bottom-empty cell of column 3 → should drop into col 3 bottom row ✓
   - TOP cell of column 5 (still empty) → should also drop into col 5 (gravity settles to bottom) ✓
   - A FILLED cell → should NOT fire a drop, cursor stays default ✓
   - Bottom cell of a FULL column → should not drop (column is full) ✓

8. Write unit tests for the click-target logic (if there's a test harness). At minimum: an e2e-ish happy-dom test that renders the Board with a partial state and asserts: clicking row 0 of col 3 fires a drop with `col: 3`; clicking row 5 of col 3 also fires drop with `col: 3`; clicking a filled cell fires nothing.

## Part B — Interaction dogfood for the other 12 games

After Part A is shipped, walk through every other game and catalog interaction bugs / usability problems. Do NOT fix them — just document. One ISSUE doc total.

**Games to review** (each has a working room you can probe via the shipped CLI — see below):

```
battleship, blackjack, codenames, gomoku, hive, liar-bar,
love-letter, splendor, texas-holdem, undercover, uno, yahtzee
```

For each game:

1. Create a room with the CLI bot (`npx tablecraft-cli rooms create <gameId>`), get the roomId.
2. `browser_navigate` to `https://tablecraft.aster.pub/` — auto-guest-session lands you.
3. Join the room with the browser (enter code, click join).
4. Have the bot ready + start (via CLI). The user's browser should transition to the game view. If it doesn't — that's a bug, note it.
5. **Interact for 5-10 clicks** and look specifically for:
   - Click targets that should work but don't (e.g. "I clicked this card but nothing happened")
   - Click targets that work but are visually not obvious (no hover state, tiny hit area, mis-positioned)
   - Interactions that look wrong (wrong turn indicator, can't tell whose turn, no feedback after action)
   - Mobile responsiveness: resize browser to 400px wide — does it still work?
   - Keyboard: can you Tab to buttons and hit Enter/Space?
   - Visual downgrades when it's NOT your turn (opponent's turn UI should discourage clicks)
   - Win/end-of-game screens: if you play through, does it tell you who won clearly?

For each issue, record: `<game>/<severity P0-P3>/<component>: <what's wrong>`. Severity guide:
- **P0**: feature broken or completely unreachable (like the connect-four column bug — fix in Part A)
- **P1**: wrong/confusing but works around
- **P2**: minor polish / missing affordance
- **P3**: nice-to-have

You don't need to play a full game — 30s-2min of interaction per game is enough to surface the obvious stuff.

Write findings to `docs/ISSUE_interaction-dogfood.md` at the end, with:
- Per-game sections
- A top summary: `X P0 bugs, Y P1 bugs, Z P2 polish items`
- Screenshots of confusing states (save under `docs/assets/dogfood-<game>-<n>.png` via browser screenshot API if possible, else describe)
- Repro steps for each (URL, click sequence)

**Time budget**: 90 minutes wall clock. If you're running over, prioritize Part A (MUST fix) and skim Part B.

## TableCraft iron rules (ALL apply, no exceptions)

1. **i18n strict**: every user-visible string goes through `t(key)` in BOTH `zh/common.json` AND `en/common.json`. Zero hardcoded strings. NEVER use `defaultValue: '中文'` / `defaultValue: 'English'`. If you add strings in Part A (for aria-labels), add locale entries to both.

2. **Typecheck is truth**: `patch` tool's isolated-file TS errors are false positives. Trust `pnpm typecheck` end-to-end.

3. **Don't touch files unrelated to your task.** Part A touches connect-four Board + its tests. Part B only writes `docs/ISSUE_interaction-dogfood.md` and `docs/assets/dogfood-*.png`. Do NOT fix other games' bugs — just document them.

4. **No commits.** Orchestrator commits. Leave files modified; I'll review `git diff --stat` and commit.

5. **CLI config location**: `~/.tablecraft/config.json` — bot token is already there. Server is `https://tablecraft.aster.pub`. `tablecraft.aster.pub` issues guest sessions automatically on first browser visit so you can play as a human without signup.

6. **Dev server**: if you need to test locally, `pnpm dev` runs :3001 (server) + :5173 (client). But production (`tablecraft.aster.pub`) is fine for dogfooding — same code.

## Validation (before declaring done)

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck                                          # green
pnpm --filter @repo/client test 2>&1 | tail -20        # green (or your game-ui package)
# Manual: play a connect-four game in browser, verify you can click TOP cells too
```

## Deliverables

1. Part A code changes at the paths you touched (connect-four Board + tests)
2. Part A verified via browser — describe the test you did in the ISSUE doc
3. `docs/ISSUE_interaction-dogfood.md` with Part B findings
4. `pnpm typecheck` green
5. A final status line: "Part A: <landed/blocked/partial>. Part B: <N P0 / N P1 / N P2 documented>"

Do NOT commit. Do NOT push. Just edit files + write the ISSUE doc. Orchestrator reviews and commits.

START NOW.
