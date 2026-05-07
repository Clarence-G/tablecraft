# Hive Token Migration Resolution

## Hex counts

- **Before**: 13 hex occurrences across 10 lines (14 counting `#fef3e0` twice on line 411)
- **After**: 2 hex occurrences (`#fef3e0` × 2, stack badge — intentional exceptions)

## Palette extracted

Extracted `PIECE_COLORS` to `games/hive/shared.ts`:

```ts
export const PIECE_COLORS = {
  white: { bgClass: 'bg-white', hex: '#ffffff' },
  black: { bgClass: 'bg-[#1a1108]', hex: '#1a1108' },
} as const;
```

White/black piece fills are canonical game-mechanic identities in Hive — the two player colors
must stay visually unambiguous across any theme change.

## Token replacements performed

| Original hex | Context | Replacement |
|---|---|---|
| `#ffffff` | white piece SVG fill | `PIECE_COLORS.white.hex` (game palette) |
| `#1a1108` | black piece SVG fill | `PIECE_COLORS.black.hex` (game palette) |
| `#3d2e1e` | white piece SVG stroke | `var(--foreground)` |
| `#c4b8a8` | black piece SVG stroke | `var(--border)` |
| `#c4b8a8` | origin dot SVG fill | `var(--border)` |
| `#d97706` | selected piece SVG stroke | `var(--warning)` |
| `#7c3aed` | stack badge circle fill | `var(--color-crown)` |
| `#16a34a` | placement target SVG color | `var(--color-success)` |
| `#2563eb` | move target SVG color | `var(--color-royal-blue)` |
| `bg-[#fef3e0]` | selected button bg (Tailwind) | `bg-warning/10` |
| `border-[#d97706]` | selected button border (Tailwind) | `border-warning` |
| `shadow-[…#3d2e1e]` | selected button shadow (Tailwind) | `shadow-[…hsl(var(--foreground))]` |

## Intentional exceptions

### `#fef3e0` (2 occurrences — stack badge stroke and text fill)

Lines 95 and 105 in `Board.tsx` — SVG `stroke` and `fill` on the beetle stack-level badge
(a small purple circle with cream-colored number).

**Why kept as hex:**
- No matching CSS custom property exists for this warm-cream tint.
- `bg-warning/10` is a Tailwind class syntax and cannot be used as an SVG `stroke`/`fill` attribute value.
- The CSS relative color equivalent (`hsl(from var(--warning) h s l / 0.1)`) requires CSS Color Level 5 which is not universally supported.
- The element is purely decorative (beetle stack indicator) and does not carry semantic state meaning.

## Typecheck

```
> tsc --noEmit -p packages/shared/tsconfig.json
> tsc --noEmit -p packages/game-ui/tsconfig.json
> tsc --noEmit -p packages/client/tsconfig.json
exit 0
```

## Test output

```
 ✓ |hive| logic.test.ts  (19 tests) 8ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
 Duration  262ms
```
