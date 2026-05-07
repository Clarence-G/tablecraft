# Splendor Token Migration — Resolution

## Hex count

- **Before**: 33 hex occurrences in `games/splendor/Board.tsx`
- **After**: 14 hex occurrences (all documented exceptions below)

## Scope

Edited files:
- `games/splendor/Board.tsx`

Did NOT edit `shared.ts` — per the worker brief, `GEM_BG` / `GEM_FG` stay
inline in `Board.tsx` with an added comment marking them as canonical
game-mechanic palette. No new palette const was extracted.

## Migrations applied

| Category | From | To |
|---|---|---|
| Skeuomorphic shadow offset | `shadow-[…_#3d2e1e]` | `shadow-[…_hsl(var(--foreground))]` (7×) |
| Deep-shadow offset | `shadow-[…_#1a1108]` | `shadow-[…_hsl(var(--shadow))]` (3×) |
| Shadow-colored border class | `border-[#1a1108]` | `border-shadow` (2×) |
| Shadow-colored border inline | `borderColor: '#1a1108'` / `'1.5px solid #1a1108'` / `'2px solid #1a1108'` | `hsl(var(--shadow))` form (3×) |
| Modal backdrop | `bg-[#1a1108]/60` | `bg-shadow/60` |
| Destructive tint | `bg-[#fde8e8]` | `bg-destructive/10` |
| Gold warning text | `text-[#d97706]` | `text-warning` |
| Noble crown accent | `text-[#7c3aed]` / `border-[#7c3aed]` | `text-[var(--color-crown)]` / `border-[var(--color-crown)]` (3×) |
| Card-back tier colors (inline) | `'#16a34a'` / `'#2563eb'` / `'#7c3aed'` ternary | `var(--color-jade)` / `var(--color-royal-blue)` / `var(--color-crown)` |

## Intentional exceptions (remaining hex)

1. **`GEM_BG` / `GEM_FG` at lines 33–47** (12 hex). Canonical game-mechanic
   palette: a ruby IS red, an emerald IS green, etc. These intentionally
   bypass `--destructive` / `--success` / `--warning` / `--foreground` so
   gem identity survives theme swaps. Per worker brief, kept inline with
   a new clarifying comment above the declaration. Consumed as inline
   `style` values, not Tailwind classes.

2. **`#f0e8fe` at lines 219 and 386** (2×). Light purple tint used as
   the noble card background and the noble-selector panel background.
   It is effectively a ~10% tint of `--color-crown` (#7c3aed) over
   white, but Tailwind v4's opacity modifier syntax on arbitrary
   CSS-var values (`bg-[var(--color-crown)]/10`) is inconsistent when
   the underlying token is stored as hex rather than HSL triplet. The
   migration guide's `Hex → token lookup table` does not include a
   mapping for `#f0e8fe`. Rather than invent a token (explicitly
   disallowed by the guide's rule #1) or switch to an unverified
   opacity form, the two occurrences are left as-is. They pair with
   the migrated `text-[var(--color-crown)]` and
   `border-[var(--color-crown)]` siblings so the noble visual identity
   now rides on the `--color-crown` token for all but the soft tint.

No new tokens were invented. `packages/client/src/index.css` was not
touched (the `--shadow` token was added by the orchestrator before this
worker ran).

## Verification

### Typecheck

```
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
```

Exit 0, no errors.

### Splendor tests

```
 RUN  v1.6.1 /Users/bytedance/Projects/tablecraft/games/splendor

 ✓ |splendor| logic.test.ts  (33 tests) 14ms

 Test Files  1 passed (1)
      Tests  33 passed (33)
```
