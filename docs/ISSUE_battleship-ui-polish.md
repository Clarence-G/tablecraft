# Battleship UI Polish

## Changes applied

- **Preview cell glow (valid placement)**: `preview` cell kind upgraded to `bg-[#2563eb]/80 border-2 border-[#93c5fd] shadow-[0_0_8px_rgba(37,99,235,0.6)]` — blue holographic glow effect.
- **Preview cell pulse (invalid placement)**: `preview-invalid` cell kind changed to `bg-[#d94040]/60 border-2 border-[#fca5a5] animate-pulse` — pulsing red to signal conflict.
- **Rotation preview silhouette fix**: replaced the broken `flex + gridRow/gridColumn` approach with a proper `inline-grid` using `gridTemplateRows`/`gridTemplateColumns` sized from the bounding box of `rotatedOffsets`. Ship shape now renders correctly in 2D for all rotations. Pre-computed `shipPreviewRows`/`shipPreviewCols` variables added before the return statement.
- **Navy frame wrapper**: the Board return is now wrapped in `<div className="mx-auto max-w-4xl p-4 sm:p-6 rounded-2xl border-2 border-[#1a1108] bg-gradient-to-br from-[#1e3a5f] to-[#0f1e33] shadow-[6px_6px_0px_0px_#1a1108]">`. The inner content div gets `bg-[#fef3e0]/5` added for a subtle parchment tint.

## Design choices

- **No new i18n keys added**: all new UI elements (mini grid, glow effects) are purely visual — no user-facing strings.
- **`shipPreviewCols` zero-guard**: `Math.max` is only called when `rotatedOffsets.length > 0`, avoiding `Math.max()` returning `-Infinity` on an empty array.
- **Rotation preview always visible**: the spec notes the silhouette is most useful before hovering, but it stays visible while hovering too — the information remains relevant during hover and hiding it on hover would cause a jarring layout shift.
- **`border-2` in `cellClass` vs base `border` on button**: Tailwind generates `border-2` after `border` in the output stylesheet, so `border-2` wins when both are present. No base class removal needed.

## Deferred

- `SHIP_NAMES_ZH` is hardcoded in `Board.tsx` — ship names in the ShipSelector and SunkIndicator titles are not going through i18n. Pre-existing issue, out of scope for this task.
- The `handleConfirmPlacement` rotation reconstruction always uses `rotation: 0` when rebuilding placements from the grid (the actual rotation is not stored per ship). This means agents calling `GET /api/games/battleship` may receive incorrect rotation values in placements. Pre-existing logic issue, not introduced here.

## Validation output

```
pnpm typecheck
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0, no errors)

pnpm --filter battleship test
> vitest run
 ✓ |battleship| logic.test.ts  (22 tests) 13ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```
