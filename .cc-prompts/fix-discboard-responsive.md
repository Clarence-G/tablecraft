# Worker W3 — DiscBoard responsive cells (connect-four CON4-01 + CON4-02)

`packages/game-ui/src/board/DiscBoard.tsx` uses fixed `w-10 h-10` (40px) cells.
At 375px mobile this is 4px below the WCAG 2.5.5 44px tap-target minimum.
At 1440px desktop the board occupies only ~26% of the available width.

## Scope (HARD fence)

**Edit ONLY these files**:
- `packages/game-ui/src/board/DiscBoard.tsx`
- `packages/game-ui/src/board/DiscBoard.test.tsx` (update test IF needed, but prefer keeping the buttons[24] assertion working)

**DO NOT touch**:
- Any game board (games/**)
- Any other game-ui component
- `IntersectionBoard.tsx` (that's gomoku's board, already fixed in round 1)
- pnpm-lock / package.json

## Task

Find the cell className (currently `w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center`). Replace the fixed `w-10 h-10` with responsive sizing:

**Target class**: `w-[clamp(44px,6vw,64px)] aspect-square`

Rationale:
- `clamp(44px, 6vw, 64px)` — never smaller than 44 (WCAG pass on mobile), grows with viewport, capped at 64 (4-in-a-row 7-column board stays visually balanced at 1440px: 7*64 + 6*gap ≈ 500px, still centered but less wasted).
- `aspect-square` — replaces `h-10` since we dropped the height, keeps cells round-square.
- Remove `w-10 h-10` entirely.

**IMPORTANT**: If there are OTHER places in DiscBoard.tsx that use `w-10` or `h-10` for the cell (e.g. disc images inside), check whether those should also scale. Conservative: leave discs as-is (they're percentage-based children, Tailwind `size-full` or similar).

## Verification — MANDATORY

1. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck' | tail -3` — exit 0
2. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/packages/game-ui && pnpm exec vitest run src/board/DiscBoard.test.tsx' | tail -15` — MUST pass. The existing test checks `buttons[24]` which is row 3 col 3 on a partial 7×4 board. That test should still work with responsive sizing since the click handler logic is unchanged.
3. `git status -s` — should list only DiscBoard.tsx (and optionally DiscBoard.test.tsx)

## If tests fail

If the existing `buttons[24]` test fails because of layout changes, the failure is a RED FLAG — you may have changed something structural. REVERT and re-investigate. Do NOT "fix" the test by changing the index.

## Done criteria

Append a resolution note to `docs/UI_REVIEW_ROUND2_FINDINGS.md` under `## W3 resolution`. Print `git status -s` and exit.

DO NOT commit.

Begin now.
