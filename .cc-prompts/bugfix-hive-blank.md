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

### Bug ID: hive-blank-board (P1)

**Symptom** (`docs/ISSUE_interaction-dogfood.md`, Hive section):
> Board renders as a near-empty brown rectangle. No piece inventory, no hex tiles, no pieces. The a11y tree shows only chrome buttons (返回/复制房间码/规则/退出/展开侧栏). The game is completely unplayable visually.

**Your game**: `games/hive/`

**Likely suspects** (investigate, don't assume):
- `Board.tsx` — the SVG viewport / viewBox may be mis-sized so content renders outside visible area.
- `Board.tsx` — inventory panel (`PIECE_ICON_PATHS` / piece stock) may be conditionally hidden (`hidden` class) or gated on a state that's never true.
- `Board.tsx` — the `pieces` array from game state may be read under the wrong key (e.g. `state.board.pieces` vs `state.pieces`).
- `Board.tsx` — initial render may depend on `tiles.length > 0` but inventory should show even when board is empty (it's where players DRAG pieces FROM).
- Missing `game-icons/hive/*.svg` assets (check `public/game-icons/hive/`).

**Reproduce**:
1. `pnpm dev` is likely already running at http://localhost:5173 (server at :3001). If not, start it yourself.
2. Write a short probe `scripts/probe-hive-render.ts` using Playwright: admin-token → create hive room → second player joins (use second admin token) → start game → navigate to `/rooms/<id>/play` as host → screenshot to `/tmp/hive-before.png` and assert you can see hex tiles + inventory.
3. Assert the bug (e.g. no SVG `<polygon>` elements, or inventory container empty).
4. Fix it. Re-run probe, assert fix.

**References to read first**:
- `games/hive/Board.tsx` (469 lines)
- `games/hive/shared.ts` — for `Tile` / `HexCoord` shape
- `games/hive/logic.ts` initial state — confirm what the view looks like at match start
- `games/gomoku/Board.tsx` as a working SVG-board reference for comparison

**Success criteria**:
- At match start in an empty Hive room, BOTH players see the piece inventory (bee/spider/beetle/grasshopper/ant with counts) rendered.
- As pieces are placed, hex tiles appear on the central play area.
- `pnpm typecheck` green.
- `pnpm vitest run games/hive` green.
