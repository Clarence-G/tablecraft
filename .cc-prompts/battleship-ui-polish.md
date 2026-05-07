# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# PARALLEL ROLLOUT NOTICE
You are running in parallel with sibling CC workers on other features. Other files in the working tree may be modified by them — this is EXPECTED, not a corruption. Do NOT `git stash`, `git reset`, `git checkout`, or otherwise discard untracked/unstaged changes under any circumstance. If `pnpm typecheck` fails on a file you didn't touch, read it, understand the sibling's contract, and adapt your own files.

---

# TASK: Battleship UI polish — placement hover preview + wood-frame background

You are polishing the Battleship game UI. Two visual changes, both in `games/battleship/Board.tsx`.

## Project path
`/Users/bytedance/Projects/tablecraft` — monorepo, pnpm workspace. All commands run from here.

## Background — READ FIRST
- Read `games/battleship/Board.tsx` end-to-end (488 lines).
- Read `games/battleship/shared.ts` to understand `CLASSIC_SHIPS`, `getAbsolutePositions`, `rotateOffsets`, `toIndex`.
- Read `games/battleship/i18n/zh.json` and `en.json` to see existing keys.
- The game has two grids side-by-side during battle: "我方舰队" (own ships + enemy's shots against you) and "敌方海域" (your shots against enemy, enemy ships hidden).
- During `placement` phase, only the own-fleet grid shows, with a ShipSelector above for picking which ship to place.
- `CellKind` already has `'preview'` and `'preview-invalid'` values used ONLY during placement hover — see `PlacementGrid` function.

## What to build — two changes

### Change 1: Placement-phase hover preview is ALREADY PARTIALLY IMPLEMENTED. POLISH IT.
Currently `PlacementGrid` computes `previewCells` on hover and applies `preview` / `preview-invalid` cell kinds. The visual result is OK but bland. Make it SHINE:

- **`preview` kind** (valid placement hover): bump to `bg-[#2563eb]/80 border-2 border-[#93c5fd] shadow-[0_0_8px_rgba(37,99,235,0.6)]` so the ghost ship glows blue like a projected holograph. Keep transition-colors smooth.
- **`preview-invalid` kind**: make it pulse-red — `bg-[#d94040]/60 border-2 border-[#fca5a5]` with class `animate-pulse` to signal conflict.
- **Also add a rotation-preview hint**: when the user has a ship selected but hasn't hovered yet (`selectedShipIdx !== null && !hoverCell`), show a small floating ship silhouette next to the `direction` indicator — use the ship's offset count (1xN cells) rendered as small blue squares, rotated per `rotation` state. This makes rotation feedback visible BEFORE hovering the grid.

### Change 2: Replace the flat dark-blue page background with a framed game board
Currently the whole page shows whatever global background color bleeds through (the "海蓝" the user mentions). Wrap the Board's return JSX in a frame:

- Wrap the Battleship `<Board>` returned JSX (the outermost `<div>` inside `export function Board`) in a **new outer container**: `<div className="mx-auto max-w-4xl p-4 sm:p-6 rounded-2xl border-2 border-[#1a1108] bg-gradient-to-br from-[#1e3a5f] to-[#0f1e33] shadow-[6px_6px_0px_0px_#1a1108]">`. This creates a dark-navy wooden frame that visually contains the game.
- Inside this frame, keep the existing board/grid/ship-selector content unchanged structurally, but change the INNER background to be lighter: add `bg-[#fef3e0]/5` to the immediate content wrapper so the grids sit on a subtle parchment tint within the navy frame.
- The existing two grids already use `bg-card/10` for water cells — keep that, it reads as dark water against the frame.

The visual effect should be: a dark-blue sea area **inside a chunky dark-brown outlined card**, centered in the page with generous margin around it. The rest of the page (lobby, chat, game header) stays unaffected because this framing is scoped to the Battleship Board only.

## Scope fence (files you may touch)
- `games/battleship/Board.tsx` — the only file with real changes.
- `games/battleship/i18n/zh.json`, `games/battleship/i18n/en.json` — add i18n keys ONLY IF you add new user-visible strings. Prefer not adding any.

**Do NOT** touch:
- `packages/game-ui/**` — sibling worker is editing there.
- `packages/client/src/hooks/useGame.ts` — sibling worker is editing there.
- `packages/server/**`, `packages/cli/**`, `skill_data/**` — unrelated to this task.
- Any other `games/*/Board.tsx` file.

## TableCraft iron rules (ALL apply)
1. **i18n strict**: zero hardcoded Chinese/English in `.tsx` / `.ts`. Every new user-visible string goes in BOTH `zh.json` and `en.json`. Never use `defaultValue` option with non-ASCII.
2. **No commit, no push.** Leave changes in the working tree. The orchestrator commits.
3. **Typecheck is truth**: `patch` tool's isolated-file TS errors are noise in pnpm monorepo. Trust `pnpm typecheck` only.
4. **Don't break existing tests**: `games/battleship/logic.test.ts` must still pass.

## Validation (run these, in order)
```bash
cd /Users/bytedance/Projects/tablecraft
pnpm typecheck        # MUST be green
pnpm --filter battleship test  # logic tests unaffected
```

## Deliverables
1. Modified `games/battleship/Board.tsx` with both changes landed.
2. `pnpm typecheck` green.
3. `games/battleship/logic.test.ts` still green.
4. A brief ISSUE doc at `docs/ISSUE_battleship-ui-polish.md` with 4 sections:
   - **Changes applied** (bullet list of what you did)
   - **Design choices** (any judgment calls where the prompt was silent)
   - **Deferred** (anything you noticed but didn't fix)
   - **Validation output** (typecheck + test result copy-paste)

START NOW.
