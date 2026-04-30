# texas-holdem polish review

## Scores

| Axis | Score | Notes |
|------|-------|-------|
| Spatial | 8.0 | Felt texture now renders (anisotropic nap + fine grain + corner vignette via `FeltTexture`). Warm spotlight radial gradient from top center gives clear depth. Cards cast shadow against felt. Pot pill has inset bevel. |
| Alive | 7.5 | Action panel has `breathe` box-shadow pulse (framer-motion, respects `prefers-reduced-motion`). Active player seat gets a gold 3px ring instead of a flat orange fill. Motion is subtle and only fires on my turn. |
| Thematic | 8.5 | Casino green felt (`#1f5233`) + warm spotlight + gold accent (`#d4a056`) + chip-shaped pot indicator + ivory-chip dealer button reads unmistakably as poker, not a generic card app. |
| Overall | 8.0 | Shipped to the polish bar. One iteration, no blockers. |

## What changed

1. **`shared.ts`** — added `meta.scene` per UX_POLISH.md §2.3 (felt / spotlight / warm / 0.40 / gold accent).
2. **`Board.tsx`** — five targeted edits:
   - `CardPlaceholder`: replaced dashed cream border with soft inset shadow on dark (reads as empty slot on felt, not missing asset).
   - `PlayerSeat`: active player uses `var(--scene-accent)` gold ring instead of orange fill; dealer "D" is an ivory chip with inset bevel; bet amounts get a small gold chip dot beside the number.
   - Pot now renders as a gold-accented pill with inset chip, using `var(--scene-accent)` for the count.
   - My-turn action card wrapped in `motion.div` with `breathe` box-shadow pulse (duration 2.2s, easeInOut, respects `useReducedMotion`).
   - Status row, hand-label, and waiting-state tinted to warm cream (`rgba(244,217,168,...)`) so they read on felt without cream panel backgrounds.
3. **`package.json`** — added `framer-motion` + `react` (matches gomoku's dep set; required for motion + `useReducedMotion`).

## Constraints honored

- No hardcoded colors swapped in outside the defined accent / scene tokens (`var(--scene-accent)` and warm cream `rgba` highlights that mirror the `WARMTH_COLOR.warm` palette from `GameScene.tsx`).
- No emoji, no confetti, no audio, no lobby theming.
- Platform chrome (header, back button, match bar) untouched.
- `prefers-reduced-motion` respected on the single motion moment.
- Test suite still passes (24/24) and `pnpm typecheck` clean.

## Screenshots

- Before: `screenshots/before/texas-holdem.png`
- After: `screenshots/after/texas-holdem.png`
