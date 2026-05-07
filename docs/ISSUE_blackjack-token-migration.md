# Blackjack Token Migration — Resolution

## Before / After hex counts

| Scope | Before | After |
|---|---|---|
| Semantic hex in `Board.tsx` | 24 | 0 |
| Intentional exceptions | — | 0 |

## Hex breakdown

| Hex | Count | Token used |
|---|---|---|
| `#16a34a` | 3 | `success` |
| `#d94040` | 4 | `destructive` |
| `#fde8e8` | 1 | `destructive/10` |
| `#d97706` | 6 | `warning` / `hsl(var(--warning))` in shadow |
| `#fef3e0` | 3 | `warning/10` |
| `#3d2e1e` | 2 | `hsl(var(--foreground))` (shadow contexts) |
| `#1a1108` | 5 | `hsl(var(--shadow))` |

## Game-mechanic palette extraction

None. The task note confirmed all hex values are semantic states (destructive for bust/lose, success for win/blackjack, warning for push/active). No palette extraction to `shared.ts` was needed.

## Intentional exceptions

None.

## Typecheck output

```
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/tablecraft
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
```

Exit 0 (no errors).

## Test output

```
 RUN  v1.6.1 /Users/bytedance/Projects/tablecraft/games/blackjack

 ✓ |blackjack| logic.test.ts  (32 tests) 8ms

 Test Files  1 passed (1)
      Tests  32 passed (32)
```

All 32 tests pass.
