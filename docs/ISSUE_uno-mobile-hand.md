# ISSUE: UNO mobile hand — cards overlap into sub-WCAG tap targets

**Severity**: major — functional but error-prone on touch
**Surfaced by**: UI review agent (20260507-124815), verified against source

## The problem

`packages/game-ui/src/card/HandStrip.tsx` collapses cards with a negative left margin when `cards.length > overlapThreshold`. For UNO's mobile path (`games/uno/Board.tsx:479-497`):

```tsx
<HandStrip
  overlapThreshold={6}
  maxOverlap={14}     // pulls each card 14px + 0.5rem to the left
  renderCard={(c, ...) => <UnoCardFace size="small" ... />}
/>
```

With `PlayingCard size="sm"` → `w-10 h-14` = **40px × 56px** each. When overlapThreshold triggers (7+ cards), every card except the last gets `marginLeft: calc(-14px - 0.5rem)` = **-22px**, leaving only **~18px of independently-tappable surface** per card in the overlapped zone.

This fails in two ways:
- **Individual card surface is 40px wide** — already below the 44px WCAG minimum even without overlap.
- **Overlapped cards show ~18px of exclusive tap area** — the left 22px of each card is underneath the previous card. Thumb-width (≥25px average) spans multiple card stacks, making intent ambiguous.

Source evidence:
- `packages/game-ui/src/card/PlayingCard.tsx:52` — `sm: 'w-10 h-14 rounded-[8px] text-xs'`.
- `packages/game-ui/src/card/HandStrip.tsx:69` — `marginLeft: calc(-${overlap}px - 0.5rem)` (= -22px when maxOverlap=14).
- `games/uno/Board.tsx:485` — `overlapThreshold={6}`.
- Screenshot `screenshots/ui-review/20260507-124815/uno_ingame_mobile.png`.

## Proposed fix

Two complementary changes. Make them **both**; neither alone is sufficient.

### Change 1: Bump UNO mobile card size to `md` (56px wide)

In `games/uno/Board.tsx:489-496` (the `sm:hidden` HandStrip), change `size="small"` to `size="normal"`. This makes each card 56×80px — above the 44px minimum.

But: 7 × 56 = 392px, won't fit in a 375px viewport. That's fine because HandStrip already handles overflow via horizontal scroll (`overflow-x-auto` on line 53). With cards at 56px the overlap math changes — see Change 2.

### Change 2: Don't let overlap eat below 44px of independent tap area

Tweak `HandStrip` so `maxOverlap` never exceeds `cardWidth - 44`. Accept a new prop `minTapWidth` (default 44). In the render loop:

```tsx
// HandStrip.tsx line ~48
const effectiveOverlap = Math.min(maxOverlap, Math.max(0, cardWidth - minTapWidth));
const overlap = cards.length > overlapThreshold ? effectiveOverlap : 0;
```

`cardWidth` needs to be known; either:
- (a) Accept it as a prop (callers pass in the PlayingCard width token), or
- (b) Measure via ref on first render using `getBoundingClientRect()`.

(a) is simpler — UNO's mobile call becomes:

```tsx
<HandStrip
  cardWidth={56}   // 'md' PlayingCard = w-14 = 56px
  minTapWidth={44}
  maxOverlap={14}
  ...
/>
```

With a 56px card and 44px minTapWidth, effectiveOverlap caps at 12px — so each card shows at least 44px of independent tap area.

### Alternative considered (do not implement)

Fan/arc layout with rotation: looks slick, but requires per-card transform-origin and messes with click-through on overlapping cards. Defer.

## Affected files

- `packages/game-ui/src/card/HandStrip.tsx` — add `cardWidth` + `minTapWidth` props, cap overlap.
- `packages/game-ui/src/card/HandStrip.test.tsx` — add tests verifying the cap.
- `games/uno/Board.tsx` — change `size="small"` → `size="normal"`, pass `cardWidth={56}` to mobile HandStrip.

Optional (if you have time): audit other HandStrip callers (liar-bar, blackjack?) and pass the same props where appropriate.

## Verification

- `pnpm --filter @repo/game-ui test` — existing tests pass; new test asserts overlap is capped.
- `pnpm typecheck` clean.
- `pnpm exec tsx scripts/shoot-games.ts uno --mobile` — visual confirmation that 7 cards don't overflow or clip, and each card shows at least 44px before its left neighbor.
- Manual: open Chrome DevTools mobile emulator (iPhone 14, 375px), deal 7 cards, verify left 44px of each card is independently hoverable (cursor shows via `cursor-pointer` from PlayingCard only on that card, not its neighbor).

## Out of scope

- Desktop hand layout — fine as-is at size="normal" + overlapThreshold=11.
- Adding a "sort by color/number" button — separate UX request.
- Redesigning UnoCardFace — the card face itself is fine; only the hand strip dimensions are the issue.
