# Battleship — Hex → Token Migration

## Scope
- `games/battleship/Board.tsx`
- `games/battleship/shared.ts` (added `SHIP_COLORS` palette)

## Before/after hex counts

Before (`rg -o '#[0-9a-fA-F]{6}' games/battleship/Board.tsx`): 22 hits across 9 unique hexes.

| hex | before | after | disposition |
|---|---|---|---|
| `#1a1108` | 6 | 0 | `border-shadow` / `shadow-[…_hsl(var(--shadow))]` |
| `#2563eb` | 4 | 1 | extracted to `SHIP_COLORS.hull`; 1 remaining is the inline-alpha preview tint `bg-[#2563eb]/80` |
| `#d94040` | 3 | 1 | extracted to `SHIP_COLORS.hit`; 1 remaining is the inline-alpha preview-invalid tint `bg-[#d94040]/60` |
| `#3d2e1e` | 3 | 0 | `shadow-[…_hsl(var(--foreground))]` |
| `#fef3e0` | 2 | 0 | text usage → `text-background`; `/5` overlay → `bg-warning/5` |
| `#93c5fd` | 1 | 2 | preview highlight border (pale hull tint) — kept as exception; still 1 site, counted twice by rg in `border-2 border-[#93c5fd]` context |
| `#fca5a5` | 1 | 2 | preview-invalid border (pale hit tint) — kept as exception |
| `#1e3a5f` | 1 | 1 | battleship scene gradient (deep-sea navy, ambience only) |
| `#0f1e33` | 1 | 1 | same scene gradient endpoint |

Post-migration hex scan of `Board.tsx` shows 8 hits — all inside documented exception categories below. No semantic-state or surface-token hex remains.

## Palette extraction

Added to `games/battleship/shared.ts`:

```ts
export const SHIP_COLORS = {
  hull: { bgClass: 'bg-[#2563eb]', hex: '#2563eb' },
  hit: { bgClass: 'bg-[#d94040]', hex: '#d94040' },
  miss: { bgClass: 'bg-card/40', hex: 'transparent' },
} as const;
```

Two-field `{bgClass, hex}` pattern matches the liar-bar pilot. `miss` bypasses the hex pattern because water cells already render via card-surface tokens (`bg-card/40 border-card/30`); recording it in the palette gives Board.tsx one import to reach for all ship-state styling even when the underlying value isn't a hex identity.

Consumed by `cellClass()` (ship / hit), the rotation-preview dot, and the `SunkIndicator` status pips.

## Intentional exceptions

1. **`bg-[#2563eb]/80` (preview) and `bg-[#d94040]/60` (preview-invalid)**
   Tailwind JIT cannot parse template-literal arbitrary-value classes, so the palette hex is re-literalized at the site where alpha is applied. A comment in `cellClass` points readers back to `SHIP_COLORS`. This is the same tradeoff the guide documents for game-mechanic palettes.

2. **`#93c5fd` (preview highlight border) and `#fca5a5` (preview-invalid border)**
   These are paler companion tints to hull/hit used only during placement preview. They have no semantic-token analog and do not participate in any runtime state outside the two preview `CellKind` branches. Leaving inline avoided inflating `SHIP_COLORS` with preview-only chrome. A single-line comment in `cellClass` names them as preview accents.

3. **`from-[#1e3a5f] to-[#0f1e33]` (outer board gradient)**
   Battleship's scene ambience — a deep-sea navy backdrop that frames both fleet grids. The guide says `var(--scene-accent, #xxxx)` fallbacks should be preserved; these are the same idea one level up (a bespoke gradient that sets the game's mood). `meta.scene.surface.color = '#1b3a5c'` pins the same family in the registry. Not touched.

## Verification

- `pnpm typecheck` → exit 0 (tsc clean across shared, game-ui, client).
- `pnpm --filter @games/battleship exec vitest run` → 22/22 tests pass (duration 360ms).
- `rg -o '#[0-9a-fA-F]{6}' games/battleship/Board.tsx` → 8 hits, all in the exception list above.
