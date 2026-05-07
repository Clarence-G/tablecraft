# ISSUE: Gomoku mobile tap targets below WCAG 44×44 minimum

**Severity**: critical — blocks playability on real touchscreens
**Surfaced by**: UI review agent (20260507-124815), verified against source

## The problem

`packages/game-ui/src/board/IntersectionBoard.tsx` renders a 15×15 grid of `<button>` cells with no padding or minimum size:

```tsx
// line 173-185
<button
  type="button"
  className="flex items-center justify-center bg-transparent border-none p-0 relative"
  ...
/>
```

The outer container is `maxWidth: ${svgSize + 10}px` with `width: 100%` and `aspectRatio: 1`, so at a 375px mobile viewport the board shrinks to fit: each cell becomes **~22px square**, roughly half the 44×44 CSS-px minimum mandated by WCAG 2.1 SC 2.5.5 and iOS/Android design guidelines.

This was verified by:
- Reading `IntersectionBoard.tsx` (no min-w / min-h / p-* on the cell button).
- Screenshot `screenshots/ui-review/20260507-124815/gomoku_ingame_mobile.png` — the 15×15 grid spans ~340px of screen width.
- Users trying to place a stone near an existing stone will misclick at high rates.

## Proposed fix

Add a mobile-only **tap-to-confirm** two-step flow without changing the board's visual density. Desktop path (hover + click) is unchanged.

### Interaction

1. User taps intersection (r, c). Board enters **armed** state: a preview stone appears at (r, c) with a subtle pulse animation AND a floating confirmation chip appears adjacent to the board (e.g. top-right corner) reading "放在 H8？✓ / ✕".
2. Tapping the ✓ button (or tapping the same cell again) commits the move by calling `onPlace(r, c)`.
3. Tapping ✕, tapping a different cell, or waiting 4 seconds cancels — armed cell clears, no action sent.

This preserves the existing 22px visual cell size (important for board aesthetics and desktop usability) while giving touch users a **44+ px tap target** for the actual commit action.

### Implementation sketch

`IntersectionBoard` gains optional mobile-tap-confirm behavior, gated by a media query hook. Do NOT change the board's dimensions or add a confirm-chip on desktop.

```tsx
// packages/game-ui/src/hooks/useIsTouchViewport.ts (new, ~10 lines)
// Returns true for viewports <= 640px. Used to conditionally render the
// confirmation chip flow instead of direct-placement on mobile.

// In IntersectionBoard:
const isTouch = useIsTouchViewport();
const [armed, setArmed] = useState<[number, number] | null>(null);

const handleCellClick = (r, c) => {
  if (!placeable) return;
  if (!isTouch) {
    onPlace?.(r, c);  // desktop: direct
    return;
  }
  if (armed && armed[0] === r && armed[1] === c) {
    onPlace?.(r, c);  // second tap on armed cell = confirm
    setArmed(null);
    return;
  }
  setArmed([r, c]);   // arm this cell
};

// When armed !== null, render a <ConfirmChip row={armed[0]} col={armed[1]}
//   onConfirm={() => {...}} onCancel={() => setArmed(null)} />
// ConfirmChip is positioned absolute within the board wrapper, sized min-h-11 min-w-24.
```

### Affected games

Any game using `IntersectionBoard`: gomoku, go (if added), mini-go. Changes to this shared component benefit all of them at once.

## Scope fence

Files you may touch:
- `packages/game-ui/src/board/IntersectionBoard.tsx`
- `packages/game-ui/src/hooks/useIsTouchViewport.ts` (new; keep ≤20 lines; use `matchMedia` + resize listener)
- `packages/game-ui/src/board/IntersectionBoard.test.tsx` — add tests covering armed/confirm/cancel flow.

Do NOT touch:
- `games/gomoku/**` — only if truly unavoidable, and only to pass a new prop. Prefer keeping the change internal to IntersectionBoard.
- Any other package.

## Verification

- `pnpm --filter @repo/game-ui test` — all existing tests pass.
- New tests cover: desktop click = direct placement (armed state never appears); mobile first click = armed (preview + chip visible, no onPlace call); mobile second click same cell = commit; mobile different-cell click = re-arm; mobile auto-cancel after 4s.
- `pnpm typecheck` clean.
- `pnpm exec tsx scripts/shoot-games.ts gomoku --mobile` — visual spot-check at 375px.

## Out of scope

- Snap-to-intersection (make tapping "near" an intersection count) — evaluated and rejected. The nearest-intersection radius required to matter (~20px) would cause mis-placement in the top-left corner of the board where the user aims at intersection (0, 0) but hits (1, 1) due to thumb size. The tap-to-confirm flow is strictly better.
- Pinch-to-zoom — requires significant scroll-and-pan plumbing; punt until this simpler fix proves insufficient.
