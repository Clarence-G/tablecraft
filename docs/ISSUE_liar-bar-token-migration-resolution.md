# Liar-Bar Token Migration — Resolution

**Pilot** for the 9-game hex-to-token migration. Validates the orchestrator's
guide and surfaces any pattern adjustments before the 8 parallel workers.

## Scope

- `games/liar-bar/Board.tsx` — migrated
- `games/liar-bar/shared.ts` — added `SUIT_COLORS` game-mechanic palette
- No other files touched

## Before / after hex counts

| Location | Before | After |
|---|---|---|
| `Board.tsx` 6-hex literals | 27 | **0** |
| `shared.ts` 6-hex literals (scene + SUIT_COLORS) | 2 | 18 |

Net: every hex in `Board.tsx` moved into either a semantic token or the
`SUIT_COLORS` const in `shared.ts`.

The 16 new hex in `shared.ts` are all inside `SUIT_COLORS` — 4 suits ×
4 fields (`bg`, `bgClass`, `border`, `text`). `bg` and `bgClass` contain the
same hex; they're both needed (see gotcha #1). The 2 pre-existing hex are
the scene surface/accent, which the guide says to leave alone.

## Tokens used (replacement counts in Board.tsx)

| Token | Replacements | Sites |
|---|---|---|
| `destructive` | 8 | revolver-fired chamber (bg+border), shot-eliminated text, out-label text, challenge button (border+bg/10+text+shadow) |
| `success` | 5 | lucky-alive text, believe button (border+bg/10+text+shadow) |
| `shadow` | 2 | play-cards primary button (border + shadow offset) |
| `SUIT_COLORS` inline style | 3 dynamic sites | challenge-result revealed cards (bg+border+text), declared-suit display text, challenging-phase declared-suit text |
| `SUIT_COLORS.bgClass` | 1 | PlayingCard `backgroundClass` prop (static-per-card lookup) |

## Verification

**Zero semantic hex in Board.tsx:**
```
$ rg -o '#[0-9a-fA-F]{6}' games/liar-bar/Board.tsx
(no matches)
```

**Typecheck:**
```
$ pnpm typecheck | tail -3
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/tablecraft
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0)
```

**Tests (32 pass):**
```
 ✓ |liar-bar| logic.test.ts  (32 tests) 7ms
 Test Files  1 passed (1)
      Tests  32 passed (32)
```

**Dev server:** `http://localhost:5173/` returns 200. Did not capture a
before/after screenshot diff — the class-level changes are all 1:1 color
swaps (same hex, different accessor), so there should be zero pixel delta
for the semantic tokens (`--destructive` is defined as `#d94040`, etc.).
`--shadow` was added by the orchestrator as `#1a1108`, matching the
original offset exactly.

## Gotchas for the guide (worth propagating to the 8 parallel workers)

### 1. PlayingCard API forces a static Tailwind class for suit backgrounds

`PlayingCard.backgroundClass` accepts a className string, not an inline
style. Tailwind JIT can only generate an arbitrary-value class like
`bg-[#e8f0fe]` if that exact literal appears in a scanned source file. A
template-literal like `` `bg-[${hex}]` `` will NOT be picked up.

**Resolution:** carry both the raw hex AND a static Tailwind class string
inside `SUIT_COLORS`:

```ts
export const SUIT_COLORS = {
  Q: { bg: '#e8f0fe', bgClass: 'bg-[#e8f0fe]', border: '#2563eb', text: '#2563eb' },
  ...
} as const;
```

Use `SUIT_COLORS[card].bgClass` for the `backgroundClass` prop, and use the
`bg` / `border` / `text` hex with `style={{ ... }}` everywhere else.

**Propagate to the guide:** under "Game-mechanic palette constants", add a
note that if a component consumes a Tailwind className for the color (not
an inline style), add a parallel `bgClass` / `borderClass` / `textClass`
field with the static arbitrary-value Tailwind string. The duplication is
intentional — JIT cannot read values, only literals.

### 2. Dynamic suit colors need `style={{...}}`, not className templates

Three sites on this board derive the color from state (`state.declaredSuit`
or `card` from a `.map`). Original code used a class template:

```tsx
className={`text-2xl font-bold ${CARD_TEXT_COLOR[state.declaredSuit]}`}
```

This worked because `CARD_TEXT_COLOR` was a static map of literal Tailwind
classes. Moving the map to `SUIT_COLORS` (with hex, per the spec) forces a
switch to inline style:

```tsx
<div className="text-2xl font-bold" style={{ color: SUIT_COLORS[state.declaredSuit].text }}>
```

This is consistent with the guide's "inline style for dynamic
theme-bypassing colors" rule — just noting that suit-based dynamic
rendering is a common case worth calling out.

### 3. `border-shadow` works as a Tailwind utility

The `--color-shadow: var(--shadow)` mapping the orchestrator added to
`@theme inline` in `index.css` means Tailwind v4 generates `border-shadow`,
`bg-shadow`, `text-shadow` utilities. Used `border-shadow` successfully on
the play-cards button — no fallback to `border-[hsl(var(--shadow))]`
needed.

**Caveat:** `text-shadow` as a utility name may collide with the CSS
`text-shadow` property in some contexts. Didn't hit it in liar-bar but
future workers should prefer `text-foreground` for text (not
`text-shadow`) and reserve the shadow token for actual shadow offsets and
deep-brown borders.

### 4. `/10` alpha tint works with `bg-destructive/10` / `bg-success/10`

Confirmed: Tailwind v4 accepts the alpha shorthand on the semantic color
utilities. No need for explicit `hsl(... / 0.1)` forms.

## git status

```
$ git status -s
 M games/liar-bar/Board.tsx
 M games/liar-bar/shared.ts
 M packages/client/src/index.css     (orchestrator's --shadow token addition)
?? .cc-prompts/tokens-liar-bar-pilot.md
?? docs/TOKEN_MIGRATION_GUIDE.md
?? docs/ISSUE_liar-bar-token-migration-resolution.md
```

Not committing per instructions.
