# Gomoku Token Migration — Resolution

## Hex counts

| File | Before | After |
|---|---|---|
| `games/gomoku/Board.tsx` | 6 | 0 |
| `games/gomoku/shared.ts` | 0 | 2 (inside `STONE_COLORS` — intentional, see below) |

## Changes made

### `games/gomoku/shared.ts`

Added `STONE_COLORS` const (two-field pattern, matching liar-bar pilot):

```ts
export const STONE_COLORS = {
  black: { bgClass: 'bg-[#1a1108]', hex: '#1a1108' },
  white: { bgClass: 'bg-card', hex: '#ffffff' },
} as const;
```

### `games/gomoku/Board.tsx`

| Line (before) | Hex | Classification | Replacement |
|---|---|---|---|
| 184 | `#d94040` | Semantic — destructive (last-move red dot) | `bg-destructive` |
| 197–199 | `#1a1108` | Shadow offset in framer-motion boxShadow array | `hsl(var(--shadow))` |
| 203 | `#1a1108` | Shadow offset static boxShadow | `hsl(var(--shadow))` |
| 233 | `#1a1108` | Game-mechanic black stone fill | `STONE_COLORS.black.bgClass` |

## Intentional exceptions

**`STONE_COLORS` hex values in `shared.ts`**: The `#1a1108` hex inside `STONE_COLORS.black.hex` and `#ffffff` inside `STONE_COLORS.white.hex` are retained intentionally. Stone colors are canonical game-mechanic identities (black stone IS #1a1108 visually) — they must not follow theme tokens so that stone recognition remains stable across theme changes. This matches the two-field pattern established by the liar-bar pilot (`SUIT_COLORS`).

## Palette extraction

Extracted `STONE_COLORS` to `games/gomoku/shared.ts`. The `bgClass` field is consumed in `Board.tsx` for the stone indicator badge; the `hex` field is available for any future canvas or inline-style usage.

## Verification output

**Zero semantic hex in Board.tsx**: `rg -o '#[0-9a-fA-F]{6}' games/gomoku/Board.tsx` — no output (clean).

**Typecheck**:
```
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0)
```

**Game tests**:
```
✓ |gomoku| logic.test.ts  (14 tests) 6ms
Test Files  1 passed (1)
     Tests  14 passed (14)
```
