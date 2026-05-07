# Worker W1 — Desktop max-w caps + Yahtzee scorecard overflow

Four games cap their Board at `max-w-lg` (512px) or `max-w-2xl` (672px), leaving
30-65% empty space on 1440px desktops. Yahtzee additionally clips its expanded
scorecard because its root has no `overflow-y-auto`.

## Scope (HARD fence)

**Edit ONLY these 5 files**:
- `games/liar-bar/Board.tsx`
- `games/love-letter/Board.tsx`
- `games/texas-holdem/Board.tsx`
- `games/yahtzee/Board.tsx`
- `games/undercover/Board.tsx`

**DO NOT touch**:
- Any other game
- Any `packages/**/*` (in particular do NOT modify `packages/game-ui/src/scene/GameScene.tsx` — its `overflow-hidden` is load-bearing)
- Tests (unless typecheck fails because you changed types, which you shouldn't)

**COORDINATION NOTE**: Worker W2 (`cc-fix-yahtzee-yah01-yah02`) is editing `games/yahtzee/Board.tsx` IN PARALLEL with you. When you start, read the CURRENT file state, and make your changes ADDITIVE to whatever W2 already changed. You both touch a different concern (W2: null guards + expand button; you: max-w + overflow-y-auto) so conflicts should be small, but always check `git status` and `git diff` before editing.

## Task — mechanical, per-file

For each file, locate the Board root `<div>` (it has `data-testid="game-board"` or a comment `{/* Board root */}` or uses the pattern `flex-1 ... max-w-* mx-auto w-full`). Change:

- `max-w-lg` → `max-w-3xl lg:max-w-5xl`
- `max-w-2xl` → `max-w-3xl lg:max-w-5xl`

Exactly those two substitutions. Do not change anything else on that className.

Specifically:

| File | Line | Before | After |
|---|---|---|---|
| games/liar-bar/Board.tsx | ~147 | `max-w-lg mx-auto` | `max-w-3xl lg:max-w-5xl mx-auto` |
| games/love-letter/Board.tsx | ~134 | `max-w-lg mx-auto` | `max-w-3xl lg:max-w-5xl mx-auto` |
| games/texas-holdem/Board.tsx | ~357 | `max-w-2xl mx-auto` | `max-w-3xl lg:max-w-5xl mx-auto` |
| games/yahtzee/Board.tsx | ~516 | `max-w-2xl mx-auto w-full` | `max-w-3xl lg:max-w-5xl mx-auto w-full overflow-y-auto` |
| games/undercover/Board.tsx | ~54 | `max-w-lg mx-auto` | `max-w-3xl lg:max-w-5xl mx-auto` |

The last one has an EXTRA change: append `overflow-y-auto` so the scorecard can scroll when expanded on short viewports (fix YAH-03).

## Why no 2-column layout

The UI review report suggested a two-column layout (main board + aside player rail) at `lg:` widths. That is a bigger architecture change and out of scope — tracked separately. We are ONLY widening the max-width cap in this sprint.

## Verification — MANDATORY

1. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck' | tail -3` — must exit 0
2. `cd /Users/bytedance/Projects/tablecraft && git status -s` — should list exactly the 4 files (+ any W2-coauthored changes in yahtzee/Board.tsx if W2 finished first)
3. `git diff games/liar-bar/Board.tsx games/love-letter/Board.tsx games/texas-holdem/Board.tsx` — should each show exactly 1 line changed

Do NOT run the app; these are pure class changes.

## Done criteria

Append a resolution note to `docs/UI_REVIEW_ROUND2_FINDINGS.md` under a new `## W1 resolution` section, listing the exact edits made. Then print `git status -s` and exit.

DO NOT commit. Orchestrator handles commits.

Begin now.
