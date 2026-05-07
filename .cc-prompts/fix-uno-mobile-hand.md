# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. Self-contained spec below. No clarifying questions — just do it.

# PARALLEL ROLLOUT NOTICE
You are running in parallel with a sibling CC worker (gomoku-mobile-tap). Other files in the working tree may be modified by them — EXPECTED. Do NOT `git stash`, `git reset`, `git checkout`, or otherwise discard unstaged changes. If `pnpm typecheck` fails on a file you didn't touch, read it and adapt your own code.

---

# TASK: UNO mobile hand — cards overlap into sub-WCAG tap targets

Full spec at `/Users/bytedance/Projects/tablecraft/docs/ISSUE_uno-mobile-hand.md`. Read it end-to-end FIRST — it explains the tap-target math, why both changes are needed, and verification.

## Project path
`/Users/bytedance/Projects/tablecraft` — pnpm monorepo. Run from here.

## Background reading (before editing)

1. `docs/ISSUE_uno-mobile-hand.md` — the issue spec.
2. `packages/game-ui/src/card/HandStrip.tsx` end-to-end (~95 lines).
3. `packages/game-ui/src/card/HandStrip.test.tsx` end-to-end.
4. `packages/game-ui/src/card/PlayingCard.tsx` — just the `SIZE_CLASSES` map (line ~50) to confirm `sm = w-10 h-14` (40px) and `md = w-14 h-20` (56px).
5. `games/uno/Board.tsx` — lines 470-520, both `sm:hidden` and `hidden sm:block` HandStrip call sites.
6. `games/liar-bar/Board.tsx` and `games/blackjack/Board.tsx` — search for `HandStrip` to see if they need similar updates (check, don't change unless necessary).
7. `CLAUDE.md` §5 — design tokens, no hardcoded colors.

## Scope fence

You may edit:
- `packages/game-ui/src/card/HandStrip.tsx` — add `cardWidth` + `minTapWidth` props, cap overlap.
- `packages/game-ui/src/card/HandStrip.test.tsx` — add tests for the cap.
- `games/uno/Board.tsx` — change mobile card size + pass new props.
- `games/liar-bar/Board.tsx`, `games/blackjack/Board.tsx` — ONLY if they call HandStrip with `overlapThreshold` and their cards are size="sm" on mobile. Pass `cardWidth` + `minTapWidth={44}` for consistency. Do NOT do this speculatively — check the actual call site first.

Do NOT edit:
- `packages/game-ui/src/card/PlayingCard.tsx` — sizes are fine as-is; don't alter SIZE_CLASSES.
- `packages/client/**`, `packages/server/**`, `packages/cli/**`, `skill_data/**`.
- `games/gomoku/**` or `packages/game-ui/src/board/**` — sibling worker is changing those.

## What to build

### Part 1: HandStrip accepts `cardWidth` + `minTapWidth`, caps overlap

Current code (HandStrip.tsx line ~48):
```tsx
const overlap = cards.length > overlapThreshold ? maxOverlap : 0;
```

Replace with:
```tsx
// When overlap is active, the visible-and-clickable slice of each card
// (except the last) is cardWidth - overlap. Don't let this fall below
// minTapWidth — otherwise the left portion of each card is obscured by
// the previous card and the user has no way to tap it unambiguously.
const effectiveOverlap =
  cardWidth !== undefined
    ? Math.min(maxOverlap, Math.max(0, cardWidth - minTapWidth))
    : maxOverlap;
const overlap = cards.length > overlapThreshold ? effectiveOverlap : 0;
```

Add to props interface:
```tsx
/**
 * Rendered width of each card in px. When set together with minTapWidth,
 * overlap is automatically reduced so every card except the last still
 * shows at least `minTapWidth` px of independently-tappable surface.
 * Omit to get the legacy behavior (overlap always = maxOverlap).
 */
cardWidth?: number;
/**
 * Minimum tappable width in px. Defaults to 44 per WCAG 2.1 SC 2.5.5.
 * Only has effect when cardWidth is also passed.
 */
minTapWidth?: number;  // default 44
```

### Part 2: UNO mobile hand uses size="normal" + cardWidth=56

`games/uno/Board.tsx` line 478-498 (the `sm:hidden` branch):

- Change `renderCard={(c, ...) => <UnoCardFace size="small" ...>}` to `size="normal"`.
- Pass `cardWidth={56}` and `minTapWidth={44}` to the HandStrip.

Why 56: PlayingCard `md` size is `w-14` = 56px. We confirmed this in the spec.

Leave the `hidden sm:block` (desktop) branch alone — it already uses `size="normal"` with different overlap settings that work fine.

### Part 3: Audit sibling games

Grep for other HandStrip callers:

```bash
rg "HandStrip" games/ --type tsx --type ts -l
```

For each caller, check if they pass `overlapThreshold` AND use `size="sm"/"small"`. If yes, pass `cardWidth={40}` (sm) or `cardWidth={56}` (md) + `minTapWidth={44}`. Don't alter their `size` prop — just add the two new props.

If a caller only ever renders ≤ overlapThreshold cards (no overlap ever kicks in), skip it. Don't add speculative props.

## Tests — extend `HandStrip.test.tsx`

Add tests:

1. Without `cardWidth`: behavior is unchanged (existing tests pass).
2. With `cardWidth=56 minTapWidth=44 maxOverlap=14 overlapThreshold=6`: render 7 cards; assert each non-last card's style contains `marginLeft: calc(-12px - 0.5rem)` (effectiveOverlap = min(14, 56-44) = 12).
3. With `cardWidth=40 minTapWidth=44 maxOverlap=14 overlapThreshold=6`: render 7 cards; assert overlap = 0 (because 40-44 = -4, clamped to 0). All cards render at full width, gap-2 only.
4. With `cardWidth=56 minTapWidth=44 maxOverlap=8`: render 7 cards; assert overlap = 8 (under the cap).
5. Card count ≤ overlapThreshold: no overlap regardless of cardWidth.

Use `container.querySelectorAll('[data-card]')` (or whatever testid the component already has) + `getComputedStyle` / inline style inspection. Mirror the existing test pattern.

## Verification

```bash
pnpm --filter @repo/game-ui test                 # existing + new HandStrip tests green
pnpm --filter @games/uno test                    # UNO logic unaffected
pnpm typecheck                                    # all packages green
pnpm exec tsx scripts/shoot-games.ts uno --mobile  # visual spot-check
```

Manual inspection of the mobile UNO screenshot: 7 cards in hand, each shows at least 44px of exclusive surface before the next card begins.

## Non-obvious traps

- `pnpm` PATH in non-interactive shells: wrap with `zsh -c 'source ~/.zshenv && pnpm ...'`.
- `patch` lint noise on game-ui files: switch to `write_file` after 2 runs of false positives.
- Don't change `maxOverlap` defaults in HandStrip — it's load-bearing for callers that don't pass `cardWidth` (back-compat).

## Done criteria

Before announcing completion:
- [ ] HandStrip tests pass (existing + 5 new).
- [ ] `pnpm typecheck` exits 0.
- [ ] `scripts/shoot-games.ts uno --mobile` produces a screenshot where 7 cards each have ≥44px visible width.
- [ ] Append a `## Resolution` section to `docs/ISSUE_uno-mobile-hand.md` summarizing files + LOC + test count.
- [ ] `git status -s` lists only scope-fenced files.

Do NOT commit. Orchestrator commits.
