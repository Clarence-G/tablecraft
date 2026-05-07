# Worker W-blackjack-tokens — hex → token migration

You are migrating hardcoded hex colors in `games/blackjack/Board.tsx` to
semantic design tokens. Follow the established pattern from the pilot
(liar-bar, already merged) verbatim.

**Hex count in this file (approximate, pre-migration)**: 25

## Required reading

BEFORE editing, read in full:
1. `docs/TOKEN_MIGRATION_GUIDE.md` — the ground-truth hex→token mapping.
2. `games/liar-bar/shared.ts` + `games/liar-bar/Board.tsx` — see how the
   pilot handled `SUIT_COLORS` (static bgClass + hex for style object) as
   the blueprint for game-mechanic palette extraction.
3. `packages/client/src/index.css` lines 40-113 — confirms available
   tokens including the new `--shadow` token.

Do NOT invent tokens. If a hex doesn't map, document it in your resolution
doc and leave as-is.

## Game-specific note

All hex values map to semantic tokens (destructive for bust/lose, success for win/blackjack, warning for push/active). No game-mechanic palette to extract.

## Scope (HARD fence)

**Edit ONLY**:
- `games/blackjack/Board.tsx`
- `games/blackjack/shared.ts` IF needed for a game-mechanic palette extraction
- Nothing else.

**DO NOT touch**:
- Any other game
- `packages/**/*` (`index.css` already has `--shadow` added)
- `docs/**/*`
- Tests (unless typecheck forces; avoid if possible)

## Task

For every hex color in the file:

1. Classify intent:
   - **Semantic state**: destructive / success / warning → map to token
   - **Surface/structure**: `#3d2e1e` → `foreground`; `#1a1108` → `shadow`
   - **Game-mechanic palette**: extract to `*_COLORS` const in `shared.ts`
   - **Scene ambience** (`var(--scene-accent, #xxxx)`): **KEEP AS-IS**
2. Replace per the guide patterns:
   - `border-[#d94040]` → `border-destructive`
   - `bg-[#fde8e8]` → `bg-destructive/10`
   - `text-[#d94040]` → `text-destructive`
   - `shadow-[Npx_Npx_0px_0px_#d94040]` → `shadow-[Npx_Npx_0px_0px_hsl(var(--destructive))]`
   - `border-[#1a1108]` → `border-shadow` (try first) OR `border-[hsl(var(--shadow))]`
   - `shadow-[Npx_Npx_0px_0px_#1a1108]` → `shadow-[Npx_Npx_0px_0px_hsl(var(--shadow))]`
3. For game-mechanic palettes, use the **two-field pattern** (bgClass +
   hex) so Tailwind JIT picks up the class but style-object access still
   works with a hex:
   ```ts
   export const GAME_COLORS = {
     red: { bgClass: 'bg-[#d94040]', hex: '#d94040' },
     // ...
   };
   ```
   This is the pattern the liar-bar pilot landed on — copy it.
4. Alpha tints (`#fde8e8` etc.) → `/10` modifier on the token.

## Verification — MANDATORY

1. **Zero semantic hex remaining**: `rg -o '#[0-9a-fA-F]{6}' games/blackjack/Board.tsx`
   — every remaining hit should be inside a game-mechanic palette
   reference, inside a `var(--scene-*, #xxxx)` fallback, or documented
   as an intentional exception in your resolution doc.
2. **Typecheck**: `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck' | tail -3` — exit 0.
3. **Game tests**: `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/blackjack && pnpm exec vitest run 2>&1' | tail -10` — all pass.

## Done criteria

Create `docs/ISSUE_blackjack-token-migration.md` with:
- Before/after hex counts
- Any intentional exceptions (and WHY)
- Whether you extracted a palette (and to what const name)
- Typecheck + test output

Print `git status -s` and exit. DO NOT commit.

## Anti-patterns

- Batch sed — read each hex in context before replacing.
- Invent new tokens.
- Touch `packages/client/src/index.css`.
- "While I'm here, let me refactor" — stay in scope.

Begin now.
