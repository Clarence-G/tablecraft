# Yahtzee — Token Migration Resolution

## Scope

Migrated hardcoded hex colors in `games/yahtzee/Board.tsx` to semantic
design tokens per `docs/TOKEN_MIGRATION_GUIDE.md`. No changes to
`games/yahtzee/shared.ts` — no game-mechanic palette needed to be
extracted (dice are value-based, not color-coded).

## Before / after hex counts

| Counted via `rg -o '#[0-9a-fA-F]{6}' games/yahtzee/Board.tsx` | Count |
|---|---|
| Before migration | 24 |
| After migration | 10 |

Net reduction: 14 semantic hexes removed. The 10 remaining are
intentional exceptions, all inside `var(--scene-accent, …)` fallbacks
or scene-specific decorative/CTA colors (see exceptions below).

## Migrations applied

| Hex (count) | Mapped to | Where |
|---|---|---|
| `#1a1108` (3) | `hsl(var(--shadow))` | dice shadow (L129), held-dot bg (L172), dice-area borderColor (L579) |
| `#0c1a2e` (6 across 4 lines) | `hsl(var(--shadow))` | opponent-card shadows (L257 ×3), status pill (L548), dice-area box-shadow (L581), scorecard (L651) |
| `#16a34a` (7) | `text-success` / `bg-success` | bonus-earned labels and upper-section progress bars |
| `#d97706` (1) | `text-warning` | score-row potential score text (L227) |
| `#fef3e0` / `#d97706` / `#fde8e8` / `#d94040` (4 on L213) | `bg-warning/10 border-warning hover:bg-destructive/10 hover:border-destructive` | score-row can-score state |

### #0c1a2e specifically

Per the worker brief, this required a scene-specific judgment call. The
scene definition in `shared.ts` (L13-20) documents that the walnut-wood
paper scene *replaced* the previous "dark navy leather" scene. `#0c1a2e`
is a dark navy color inherited from that older scene — it no longer
derives from the current walnut (`#3d2f24`) surface or the honey-gold
(`#f4c744`) accent. Migrating these to `--shadow` (deep warm brown,
`#1a1108`) aligns the shadow color with the current scene's palette
and is visually the same family as every other skeuomorphic drop-shadow
in the codebase. Not scene-specific after migration to walnut.

## Intentional exceptions (remaining hexes)

| Hex | Line(s) | Why kept |
|---|---|---|
| `#fbf4df` | 44 | Paper scorecard cream base color (background inline style). Not in the token table — a decorative surface tint specific to the paper-textured scorecard gradient. No semantic token maps. |
| `#fff6d9` | 128 | Held-die cream/gold bg. Decorative cream accent paired with the honey-gold scene accent. Not in the token table. |
| `var(--scene-accent, #d97706)` | 132, 165 | Scene-accent fallback — the correct CSS-var pattern. Guide says keep as-is. |
| `var(--scene-accent, #f4c744)` | 615 | Scene-accent fallback — keep. |
| `#2a1f14` | 610, 622, 623, 624, 629 | Deeper-brown text/border/box-shadow specifically chosen for contrast on the honey-gold `--scene-accent` roll-button CTA. Documented in the existing inline comment (L605-609): "Dark-brown text keeps the on-paper feel." Darker than `--foreground` (#3d2e1e) by design to contrast the gold bg; migrating to `--foreground` would visually soften the CTA. Not a shadow offset — a deliberate scene-paired CTA color. Per the worker brief's scene-specific allowance, left as-is. |

None of the remaining hexes is a semantic-state, structural, or shadow
color that has a matching token.

## Palette extraction

**None.** Yahtzee dice use value-based faces (SVG glyphs), not
color-coded categories — there is no game-mechanic palette like UNO's
four colors or Splendor's five gems. The migrations above cover
semantic state only.

## Verification output

### Typecheck

```
$ pnpm typecheck
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0, no output)
```

### Tests

```
$ cd games/yahtzee && pnpm exec vitest run
 RUN  v1.6.1 /Users/bytedance/Projects/tablecraft/games/yahtzee
 ✓ |yahtzee| logic.test.ts  (28 tests) 6ms
 Test Files  1 passed (1)
      Tests  28 passed (28)
```

Both green.
