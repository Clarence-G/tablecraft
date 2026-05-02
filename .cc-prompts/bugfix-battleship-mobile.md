# Bug Fix — TableCraft CC Worker

You are a focused bug-fix worker on the TableCraft monorepo at `/Users/bytedance/Projects/boardgames`. Your job is ONE well-defined bug fix in ONE game.

## Monorepo context (do NOT re-discover)

- pnpm workspace. Root commands: `pnpm typecheck`, `pnpm vitest run <path>`.
- Games live under `games/<id>/` — each has `Board.tsx` (client render), `logic.ts` (server rules), `shared.ts` (types), `i18n/{zh,en}.json`, and tests.
- `Board.tsx` uses React + TSX, imports from `@repo/game-ui` and `@repo/shared`. No Vue, no Svelte.
- DESIGN.md ethos: warm skeuomorphic — cream bg, thick brown borders, hard shadows. Keep existing style; don't re-theme.
- Mobile breakpoint: `md:` Tailwind (≥768px). Below 768 is mobile — **design mobile-first, never hide mobile functionality**.
- i18n: `useTranslation('<gameId>')` scopes to that game's namespace. Every user-visible string MUST go through `t('...')`, never hardcode zh/en.

## Hard process constraints

1. **ONLY touch files under `games/<your-game-id>/`** unless explicitly instructed. Do NOT modify `packages/**`, `games/other-games/**`, or shared utilities.
2. **Reproduce the bug FIRST** — read the files, write a failing test or probe script, confirm you see what the issue describes. No fix without repro.
3. **Fix the bug MINIMALLY** — smallest possible change. No refactoring, no renaming, no "while I'm here" cleanup. Resist the temptation.
4. **Verify the fix**:
   - `pnpm typecheck` must pass (run from repo root)
   - `pnpm vitest run games/<id>` must pass (if tests exist for this area, add one for this bug)
   - If it's a UI bug, write a short Playwright probe in `scripts/probe-<bug>.ts` and run headless to confirm visually (use `vision_analyze` via a screenshot saved to /tmp/ if needed — but you don't have vision tools, so just `page.screenshot({ path: '/tmp/<bug>.png' })` and the orchestrator will review).
5. **DO NOT commit or push** — leave changes staged-worthy but uncommitted. The orchestrator will review the diff, run their own verification, and commit.
6. **DO NOT change i18n strings' meaning** — if you need new keys, add them; never repurpose existing ones.
7. **DO NOT touch `scripts/imagen-*.sh` or `out/covers/`** — those are unrelated image-generation assets.
8. **When done, write a short summary** to `/tmp/worker-<bug-id>-summary.md` with: root cause (1 paragraph), files changed (list), verification output (typecheck + test results as copy-paste), any follow-ups the orchestrator should know.

## Bug to fix

### Bug ID: battleship-mobile-grid (P1)

**Symptom** (`docs/ISSUE_interaction-dogfood.md`, Battleship section):
> At 375px viewport, the ship-placement grid is completely absent — only the player list and background scene render.

**Your game**: `games/battleship/`

**Likely suspects** (investigate, don't assume):
- `Board.tsx` — fixed-width grid (e.g. `w-[600px]`) with no `md:` breakpoint fallback, so at 375px the overflow-hidden ancestor clips it entirely.
- `Board.tsx` — grid hidden on mobile via `hidden md:grid` (a hard mobile-first violation).
- `Board.tsx` — uses CSS Grid with `grid-cols-10` and fixed `w-12 h-12` cells → 10×48 = 480px → overflows a 375px container that clips instead of scrolls.
- Parent container applies `overflow-hidden` somewhere; may need `overflow-x-auto` on the grid wrapper ONLY at mobile.

**Reproduce**:
1. Write `scripts/probe-battleship-mobile.ts`: spawn two admin tokens, create + join a battleship room, start it, open `/rooms/<id>/play` in Playwright at viewport `{ width: 375, height: 667 }` as player 1.
2. Screenshot to `/tmp/battleship-mobile-before.png`.
3. Assert the grid is visible: the DOM has 100 cells (10×10) and the first cell has `getBoundingClientRect().width >= 20 && .height >= 20`.
4. Fix. Re-run, assert fix.

**Design constraint**: the grid must be fully TAPPABLE on 375px. Minimum cell touch target 28×28px (that's ten cells ≈ 280px, fits with some margin). Use responsive sizing: e.g. `w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12`. If that's still too tight, wrap in a horizontal scroller with snap points.

**References**:
- `games/battleship/Board.tsx` (488 lines)
- `games/battleship/shared.ts` — grid dimensions
- `games/connect-four/Board.tsx` — recently fixed for mobile drop-zones; use as responsive reference
- Global Tailwind: `md` = 768px+, `sm` = 640px+. Mobile-first means base classes target <640px.

**Success criteria**:
- 375×667 viewport: full 10×10 grid visible (or scrollable horizontally), cells tappable.
- ≥768px viewport: looks unchanged from current desktop.
- `pnpm typecheck` green.
- `pnpm vitest run games/battleship` green.
