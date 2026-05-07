# Token Migration Guide — TableCraft

**Purpose**: Map every hardcoded hex color in `games/**/Board.tsx` to its
semantic design token from `packages/client/src/index.css`.

**When to use**: Before starting a hex-to-token migration on any game Board.
Follow this mapping verbatim — do not invent new tokens.

## Current palette (source of truth)

All tokens are defined in `packages/client/src/index.css` under the `:root`
block. This list captures every color token, sorted by intent:

### Surface
| Token | Value | Where to use |
|---|---|---|
| `--background` | `#faf5eb` | page background (rarely needed in games) |
| `--foreground` | `#3d2e1e` | primary text, primary borders, skeuomorphic shadows |
| `--card` | `#ffffff` | card / panel surface |
| `--card-foreground` | `#3d2e1e` | text on card |
| `--popover` | `#ffffff` | popover surface |
| `--popover-foreground` | `#3d2e1e` | text on popover |

### Action
| Token | Value | Intent |
|---|---|---|
| `--primary` | `#3d2e1e` | main action buttons (dark brown) |
| `--primary-foreground` | `#ffffff` | text on primary |
| `--secondary` | `#f0e8d8` | secondary action surface |
| `--secondary-foreground` | `#3d2e1e` | text on secondary |
| `--muted` | `#f0e8d8` | muted surface (same as secondary in current theme) |
| `--muted-foreground` | `#6b5744` | muted text, captions |
| `--accent` | `#f0e8d8` | accent (same as secondary) |
| `--accent-foreground` | `#3d2e1e` | text on accent |

### Semantic state
| Token | Value | Intent |
|---|---|---|
| `--destructive` | `#d94040` | danger, error, destructive actions, bust, loss, hit/sunk |
| `--destructive-foreground` | `#ffffff` | text on destructive |
| `--success` | `#16a34a` | success, wins, positive state, believed, bonus-earned |
| `--success-foreground` | `#ffffff` | text on success |
| `--warning` | `#d97706` | warning, amber highlights, all-in, push, active cell |
| `--warning-foreground` | `#7a4006` | text on warning |

### Structural
| Token | Value | Intent |
|---|---|---|
| `--border` | `#c4b8a8` | standard borders between surfaces |
| `--input` | `#c4b8a8` | input field borders |
| `--ring` | `#3d2e1e` | focus ring (same as primary) |
| `--board` | `#d4a056` | board surface (felt) |
| `--board-line` | `#6b5744` | grid lines on board |

### Decorative / game-specific
Available as `var(--color-*)` or as Tailwind arbitrary values referencing
the CSS var:

| Name | Value | Use |
|---|---|---|
| `--color-dice-red` | `#d94040` | dice red (same as destructive) |
| `--color-royal-blue` | `#2563eb` | royal blue — cards, team blue |
| `--color-jade` | `#16a34a` | jade green (same as success) |
| `--color-amber` | `#d97706` | amber (same as warning) |
| `--color-crown` | `#7c3aed` | crown purple |
| `--color-coral` | `#e8556d` | coral accent |

## Hex → token lookup table

**Mechanical replacements** (unambiguous, do these everywhere):

| Hex | Token(s) | Notes |
|---|---|---|
| `#d94040` | `destructive` | 29× occurrences across 8 games. Use `bg-destructive`, `border-destructive`, `text-destructive`, `shadow-destructive`. For the 10% alpha tint (e.g. `#fde8e8`) use `bg-destructive/10`. |
| `#fde8e8` | `bg-destructive/10` (9% tint) | Always paired with `border-destructive + text-destructive`. |
| `#16a34a` | `success` | 25× across 7 games. `bg-success`, `border-success`, `text-success`. |
| `#e8f8ee` | `bg-success/10` | |
| `#d97706` | `warning` | 18× across 7 games. `bg-warning`, `border-warning`, `text-warning`. |
| `#fef3e0` | `bg-warning/10` | warm amber tint |
| `#3d2e1e` | `foreground` | 16× — use `border-foreground`, `text-foreground`, `bg-foreground`, `shadow-[…_#3d2e1e]` → `shadow-[…_hsl(var(--foreground))]` |
| `#1a1108` | `shadow` token — use `border-shadow`, `bg-shadow`, or `shadow-[Npx_Npx_0px_0px_hsl(var(--shadow))]` for box-shadow offsets | 51× — the "near-black" shadow offset that gives every board its skeuomorphic depth. The `--shadow` token + `--color-shadow` export was added to `index.css`, so `border-shadow` / `bg-shadow` / `text-shadow` Tailwind utilities work out of the box (verified by the pilot). Box-shadow CSS needs the explicit `hsl(var(--shadow))` form because Tailwind doesn't generate arbitrary-value utilities for shadow-offset strings. |
| `#2563eb` | `[var(--color-royal-blue)]` or keep as decorative | 11× — mostly card suit / team colors. OK to reference CSS var directly for decorative use: `bg-[var(--color-royal-blue)]`. |
| `#7c3aed` | `[var(--color-crown)]` | 7× — crown purple, card suit. |
| `#ffffff` | `white` (Tailwind builtin) or `card` when on a surface | 5× — usually gem fill, cards — keep as is or migrate to `bg-card` if surface intent. |

**Keep as-is** (these are intentional scene accents via `var(--scene-accent, …)` — already proper CSS-var pattern):
- `var(--scene-accent, #d4a056)`
- `var(--scene-accent, #d97706)`
- `var(--scene-accent, #f4c744)`
- `var(--scene-accent, #f4d9a8)`

These use CSS custom-property FALLBACKS, which is the correct pattern for
ambience-themed colors. Do not "fix" them.

**Game-mechanic palette constants** (extract, do not inline):

Splendor `GEM_BG_COLORS` / `GEM_FG_COLORS` at `games/splendor/Board.tsx:28-42`
— these represent game rules (a ruby IS red). Extract the whole object to
`games/splendor/shared.ts` as an exported const `GEM_PALETTE`. Still hex,
still inline-style — but now it's a named data constant, not a drive-by
styling decision. Mark the intent with a comment:

```ts
// Gem colors are canonical game-mechanic identities, not theme tokens.
// They intentionally bypass --destructive/--success etc. so ruby always
// looks ruby regardless of theme changes.
export const GEM_PALETTE = { … } as const;
```

Same for UNO `COLOR_PALETTES` (line 13-19) — the four UNO colors ARE the
game. Extract to `games/uno/shared.ts`.

## Shadow token strategy (for `#1a1108` — the big one)

`#1a1108` appears 51 times as the near-black skeuomorphic shadow offset.
It's slightly darker than `--foreground` (#3d2e1e) to make shadows punchy.
Two options, pick ONE consistently:

### Option A — Introduce `--shadow` token (preferred, forward-compatible)

Add to `packages/client/src/index.css`:

```css
:root {
  /* ... existing tokens ... */
  --shadow: #1a1108;         /* deep brown offset for skeuomorphic depth */
  --color-shadow: var(--shadow);
}
```

Then replace every `shadow-[…_#1a1108]` with `shadow-[…_hsl(var(--shadow))]`
or (if using 4px_4px_0px_0px) with a named utility.

### Option B — Migrate to `--foreground` (simpler, slight visual shift)

Replace every `#1a1108` with `hsl(var(--foreground))` / `theme(colors.foreground)`.
Visual result: skeuomorphic shadows become slightly warmer and lighter.
Run the app visually first on at least two games to confirm it still reads
correctly before committing to 51 replacements.

**Decision for this migration batch**: Use Option A. Adding one token is
cheaper than re-testing every shadow visually, and preserves the exact
current look. The per-game workers should ASSUME `--shadow` already exists;
the orchestrator will add it to `index.css` as part of this umbrella commit.

## Pattern examples

### Before
```tsx
className="border-2 border-[#d94040] bg-[#fde8e8] text-[#d94040]
            shadow-[4px_4px_0px_0px_#d94040]"
```

### After
```tsx
className="border-2 border-destructive bg-destructive/10 text-destructive
            shadow-[4px_4px_0px_0px_hsl(var(--destructive))]"
```

### Before (skeuomorphic shadow)
```tsx
className="shadow-[4px_4px_0px_0px_#1a1108]"
```

### After
```tsx
className="shadow-[4px_4px_0px_0px_hsl(var(--shadow))]"
```

### Before (inline style)
```tsx
<div style={{ borderColor: '#1a1108' }}>
```

### After
```tsx
<div style={{ borderColor: 'hsl(var(--shadow))' }}>
```

## Non-negotiable rules for workers

1. **Never invent new tokens**. If a hex doesn't match this table, stop and
   ask the orchestrator — don't guess an intent.
2. **Never change the visual output more than necessary**. Run the app, diff
   screenshots if possible.
3. **Extract game-mechanic palettes** (gem colors, UNO colors, hive piece
   fills) to a named `*_PALETTE` const in `shared.ts`. Do NOT migrate these
   to tokens.
4. **Preserve `var(--scene-accent, #xxxxxx)` as-is**. Those are already
   correct theming pattern.
5. **Do not touch tests** unless typecheck forces you; the color in a test
   assertion is usually intentional.
6. **Verify per-file**: `pnpm typecheck` + visual sanity check the one game
   you touched (dev server screenshot).

## Worker scope boundaries

Each worker operates on ONE game's `Board.tsx` (and optionally its `shared.ts`
for game-mechanic palette extraction). No worker may:

- Modify `packages/client/src/index.css` (orchestrator does the `--shadow`
  token addition once at the start of the batch)
- Modify any other game
- Modify `packages/game-ui/*` (different scope entirely)
- Modify shared components or `Room.tsx` / `Game.tsx`

## Phase order

1. **Phase 0 (orchestrator)**: Add `--shadow` token to `index.css`. Verify
   build still clean. Commit alone as `chore(tokens): add --shadow token
   for skeuomorphic offsets` or fold into Phase 1 commit.
2. **Phase 1 (orchestrator runs pilot worker)**: liar-bar migration. It's
   the game with the most semantic hex (27 hex, mostly destructive/success).
   Verify the pattern works end-to-end. If the pilot uncovers gotchas,
   update THIS GUIDE before launching the rest.
3. **Phase 2 (8 parallel workers)**: one per remaining game. Use this
   guide verbatim. Stagger launches by 5s each to avoid Chromium / gateway
   spikes.
4. **Phase 3 (orchestrator merges + bundled commit)**: full `pnpm test` +
   visual screenshot review of every changed game.
