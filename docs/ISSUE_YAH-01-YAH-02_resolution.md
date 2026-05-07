# YAH-01 / YAH-02 Resolution

## Files changed
- `games/yahtzee/Board.tsx`

## YAH-01 — First-render crash guard

### Diff summary
Split `Board` into an outer guard + inner `BoardInner`, so the fail-closed
early-return runs **before** any hook is called — satisfying React Rules of
Hooks (Board has 14 hooks total: useTranslation, useGameLog, useReducedMotion,
useState, useGameHeaderStatus, plus 6 useRef and 3 useEffect further down):

```tsx
export function Board(props: BoardProps<PlayerView, Action>) {
  if (!props.state || !props.state.players || props.state.players.length === 0) {
    return null;
  }
  return <BoardInner {...props} />;
}

function BoardInner({ state, myId, players, sendAction: rawSendAction, isSending }: ...) {
  // all hooks + derived state now live here, guaranteed state is hydrated
  ...
}
```

### Why this pattern

The original single-function guard-at-top was a React Rules-of-Hooks
violation: if the first render returned `null` (0 hooks) and the second
render proceeded past the guard (14 hooks), React would log "Rendered more
hooks than during the previous render" and blow up differently than the
original crash. The outer/inner split is the canonical escape hatch — the
outer function has no hooks, only branching; the inner function has hooks
and is only mounted once state is guaranteed to be present.

### What was crashing
Suspects were the unguarded `state.players.find(...)` (~L418) and
`state.players.filter(...)` (~L442), plus the three `useEffect` bodies
that read `state.dice`, `state.players`, `state.winner`. All of these now
execute only when `state.players` is a non-empty array because BoardInner
doesn't mount until the guard passes.

## YAH-02 — Expand/collapse button tap target

### Diff summary
The scorecard expand toggle previously rendered as `text-xs underline` with
no padding (~14 px tall). Updated the single button element to:

```tsx
className="text-xs text-muted-foreground underline inline-flex items-center min-h-[44px] py-2 px-3"
```

- `min-h-[44px]` meets WCAG 2.1 SC 2.5.5 (44×44 min).
- `py-2 px-3` expands the clickable padding without enlarging the text.
- `inline-flex items-center` keeps the text visually centered inside the now
  44-px-tall hit area so the cap-height alignment of the label stays the
  same as before.

No color, font-size, or underline change — visual appearance of the label
itself is preserved; only the hit area grew.

## Verification

### `pnpm typecheck`
```
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/tablecraft
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
```
Exit 0.

### `pnpm exec vitest run` (in `games/yahtzee`)
```
 RUN  v1.6.1 /Users/bytedance/Projects/tablecraft/games/yahtzee

 ✓ |yahtzee| logic.test.ts  (28 tests) 7ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
```

### `git status -s` (yahtzee-scoped rows only)
```
 M games/yahtzee/Board.tsx
```

Orchestrator is free to commit.
