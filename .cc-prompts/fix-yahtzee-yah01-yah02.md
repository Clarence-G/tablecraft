# Worker W2 — Yahtzee critical crash + tap target

You are a **surgical fix worker**. Strict scope, no drift. Ship fast.

## Project
`/Users/bytedance/Projects/tablecraft` — pnpm workspace.

## Scope (HARD fence — violations fail the task)

**You may edit ONLY these files**:
- `games/yahtzee/Board.tsx`
- `games/yahtzee/logic.ts` IF AND ONLY IF needed to change types (unlikely)

**You must NOT touch**:
- Any other `games/*/Board.tsx`
- Any `packages/**/*`
- `pnpm-lock.yaml`, `package.json`, `node_modules/`
- `scripts/`, `docs/`
- `.cc-prompts/`

## Tasks

### YAH-01 (CRITICAL) — Guard against first-render crash

A Sentry ErrorBoundary fallback ("Something went wrong") intermittently replaces
the board on yahtzee ingame render — reproduced on UI review batch-a. Likely a
null access before the first WebSocket state arrives.

1. READ `games/yahtzee/Board.tsx` end-to-end.
2. Identify every `state.players[...]`, `state.winner`, `state.scorecard`, `state.currentPlayer`, `state.rollsRemaining`, `state.dice` access.
3. For each access that could be undefined/null at first-render (before first state sync), add a null-guard. PREFER an early return:
   ```tsx
   if (!state || !state.players || state.players.length === 0) {
     return null;   // let the GameScene loading state show
   }
   ```
   placed right at the top of the component body, BEFORE any other derived
   state or computed values. This fail-closed pattern is the simplest and
   least disruptive.
4. Do NOT wrap individual JSX fragments in conditionals — that bloats the
   render. Single guard at the top is the right architecture.
5. If `state.winner` is referenced only in rendering (e.g. `{state.winner && ...}`), those inline guards are fine and don't need to be touched.

### YAH-02 (MAJOR) — Fix expand button tap target

The scorecard expand/collapse button is ~14px tall (text-xs underline, no
padding), well below WCAG 2.1 SC 2.5.5 (44×44 min). Find it near line 641
(look for `t('myScorecard')` or `展开` or an `onClick` toggling `expanded` state).

- Add tap-friendly padding: `py-2 px-3 min-h-[44px]`
- KEEP visual look (don't turn text button into a giant chunky button — just
  pad the clickable area). If it currently uses `text-xs underline` styling,
  consider `inline-flex items-center min-h-[44px] py-2 px-3` so the hit area
  is 44px but the text looks the same.

## Verification — MANDATORY

After edits run IN ORDER:

1. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck 2>&1' | tail -5` — must exit 0
2. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/yahtzee && pnpm exec vitest run 2>&1' | tail -20` — should pass if tests exist (they're allowed to show pre-existing failures NOT in yahtzee itself; a yahtzee test failing means you broke something and must fix)
3. `cd /Users/bytedance/Projects/tablecraft && git status -s` — should list only `games/yahtzee/Board.tsx` (and optionally logic.ts)

## Done criteria

- `docs/ISSUE_YAH-01-YAH-02_resolution.md` created with:
  - What you changed (diff summary)
  - Why the guard is safe (doesn't hide real errors, just the pre-state-sync window)
  - Test output
- Print final `git status -s` and exit.
- DO NOT commit. The orchestrator does commits.

## Anti-patterns — DO NOT DO

- Catch-all try/except around the whole component — hides real bugs
- `state?.players?.[0]?.name ?? ''` chains everywhere — noisy, obscures real errors
- Introducing a loading spinner component — out of scope
- "While I'm here, let me also..." — out of scope, always

Begin now.
