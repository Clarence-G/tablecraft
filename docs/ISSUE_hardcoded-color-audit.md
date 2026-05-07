# ISSUE: Hardcoded color audit across game boards

**Discovered:** 2026-05-07, during post-UI-review code audit.
**Scope:** 9 of 13 games use Tailwind arbitrary-value hex colors
(`border-[#xxx]`, `bg-[#xxx]`, `text-[#xxx]`, `shadow-[…#xxx]`),
violating CLAUDE.md rule §2: "Use Design Tokens. Never hardcode colors."

## Count per game (rg -c pattern)

| Count | File |
|------:|------|
| 19 | games/liar-bar/Board.tsx |
| 19 | games/blackjack/Board.tsx |
| 16 | games/splendor/Board.tsx |
| 15 | games/yahtzee/Board.tsx |
| 14 | games/texas-holdem/Board.tsx |
| 14 | games/battleship/Board.tsx |
|  9 | games/uno/Board.tsx |
|  2 | games/gomoku/Board.tsx |
|  1 | games/hive/Board.tsx |
| **109** | **total** |

Clean boards (use tokens only): connect-four, love-letter, codenames,
undercover.

## Why it matters

- **Dark mode drift**: hardcoded `#1a1108` / `#fde8e8` stay fixed when
  the theme inverts, breaking contrast.
- **Brand refresh friction**: changing primary/destructive/etc. requires
  touching every board file.
- **Semantic loss**: `#d94040` reads as "red" to a dev, not "danger /
  destructive action"; `#16a34a` reads as "green" not "confirm /
  positive action". Token names self-document intent.

## Non-trivial: requires per-color classification, not sed

Each hex must be mapped to the right semantic token. Example from
liar-bar/Board.tsx:299,306:

- `border-[#d94040] bg-[#fde8e8] text-[#d94040] shadow-[...#d94040]`
  (challenge button, destructive) → `border-destructive
  bg-destructive/10 text-destructive shadow-[...hsl(var(--destructive))]`
  (or an extracted `--accent-danger` CSS var)
- `border-[#16a34a] bg-[#e8f8ee] text-[#16a34a] shadow-[...#16a34a]`
  (believe button, success/positive) → needs a `success` / `positive`
  token, which may not exist yet in the palette — **check DESIGN.md**
  before inventing one.

Also common: `#1a1108` (near-black foreground used for skeuomorphic
shadows/borders across every game) → should be `hsl(var(--foreground))`
everywhere, but NEVER the literal value.

## Proposed plan

1. **Phase 0 — Token audit**: dump the current token palette from
   `packages/client/src/index.css` + DESIGN.md to see what names exist
   (primary, destructive, accent, muted, border, etc.). If there's no
   `success` / `positive` token, propose one before touching games.
2. **Phase 1 — One CC worker per game**, scope strictly its Board.tsx:
   for each hex, decide semantic intent from surrounding class context
   and replace with the matching token. Do NOT change layout, spacing,
   or any non-color class. Verify via visual diff after.
3. **Phase 2 — Lint rule**: add a biome / eslint rule that forbids
   `(border|bg|text|shadow|ring)-\[#[0-9a-f]+` in games/ and
   packages/client/, so new violations can't land.

Phase 1 workers are safely parallelizable because each edits only one
file and changes are localized. Estimated: 9 concurrent workers, 10-15
min each.

## Deferred; do not start until UI review batch is merged

The 3 concurrent UI-review agents (batch-a/b/c) are still running. Their
findings may subsume some hex replacements. Wait for their reports
before launching Phase 1 so we don't duplicate edits.
