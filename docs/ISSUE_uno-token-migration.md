# UNO Token Migration Resolution

## Hex counts

- **Before**: 31 hex color occurrences in `games/uno/Board.tsx`
- **After**: 3 remaining in `Board.tsx` (all intentional — see Exceptions)

## Palette extraction

Extracted `COLOR_PALETTES` (the four UNO card colors) to `games/uno/shared.ts` as:

```ts
export const UNO_COLORS = {
  red:    { bgClass: 'bg-[#d94040]', hex: '#d94040' },
  blue:   { bgClass: 'bg-[#2563eb]', hex: '#2563eb' },
  green:  { bgClass: 'bg-[#16a34a]', hex: '#16a34a' },
  yellow: { bgClass: 'bg-[#d97706]', hex: '#d97706' },
} as const;
```

Two-field pattern (bgClass + hex) follows the liar-bar pilot verbatim. The `hex`
field is consumed by `getCardStyle` for `color-mix()` gradients; the `bgClass`
field satisfies Tailwind JIT scanning from `shared.ts`. Removed the local
`CARD_COLOR_HEX` const in `Board.tsx` since `UNO_COLORS` is the canonical source.

## Semantic mappings applied

| Original | Replacement | Location |
|---|---|---|
| `border-[#1a1108]` | `border-[hsl(var(--shadow))]` | `getCardStyle`, draw pile ×2, meta circles ×2 |
| `bg-[#1a1108]/60` | `bg-[hsl(var(--shadow))]/60` | `ColorPickerModal` overlay |
| `shadow-[4px_4px_0px_0px_#3d2e1e]` | `shadow-[4px_4px_0px_0px_hsl(var(--foreground))]` | `ColorPickerModal` dialog |
| `shadow-[#1a1108_-2px_2px_0px]` | `shadow-[hsl(var(--shadow))_-2px_2px_0px]` | player strip, meta circles ×2 |
| `boxShadow: '#1a1108 -4px 4px ...'` | `boxShadow: 'hsl(var(--shadow)) -4px 4px ...'` | `turnCardAnimate` (3 keyframes + static) |
| `#1a1108` in gradient string | `hsl(var(--shadow))` | draw pile card back gradient ×2 |
| 4× UNO colors in conic-gradient | `UNO_COLORS.*.hex` template refs | `getCardStyle` wild card background |

## Intentional exceptions (leave as-is)

### `#2a1810` and `#0d0805` — draw pile card back gradient

**Location**: `Board.tsx` lines 356 and 372 (same string, used for both the ghost
card layer and the draw pile button).

**Why**: These two stops form the dark-brown gradient on the UNO card back
(`#2a1810 → hsl(var(--shadow)) → #0d0805`). They are decorative card-design
colors that don't map to any documented semantic token. They should remain hex
until/unless a dedicated token is added for UNO card back colors.

### `var(--scene-accent, #f4d9a8)` — scene accent fallback

**Location**: `Board.tsx` line 379 (`color: 'var(--scene-accent, #f4d9a8)'`).

**Why**: Already follows the correct CSS-var-with-fallback pattern per the guide
("Preserve `var(--scene-accent, #xxxxxx)` as-is").

## Verification output

```
typecheck:
> tsc --noEmit -p packages/shared/tsconfig.json \
  && tsc --noEmit -p packages/game-ui/tsconfig.json \
  && tsc --noEmit -p packages/client/tsconfig.json
(exit 0, no errors)

game tests:
✓ |uno| logic.test.ts  (27 tests) 8ms
Test Files  1 passed (1)
     Tests  27 passed (27)
```
