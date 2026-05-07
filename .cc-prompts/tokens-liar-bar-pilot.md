# Worker W-liar-bar-tokens — PILOT: hex → token migration

You are the **pilot** for a 9-game token migration. Your job: migrate every
hardcoded hex in `games/liar-bar/Board.tsx` to its semantic token per the
migration guide. You succeed; the remaining 8 games follow your pattern.

## Required reading

BEFORE editing, read in full:
1. `docs/TOKEN_MIGRATION_GUIDE.md` — the ground-truth hex→token mapping.
2. `packages/client/src/index.css` lines 1-113 — confirms which tokens exist
   (including the newly-added `--shadow` token the orchestrator landed).

Do NOT invent tokens. If a hex doesn't map, ask via the doc — don't guess.

## Scope (HARD fence)

**Edit ONLY**:
- `games/liar-bar/Board.tsx`
- Optionally `games/liar-bar/shared.ts` IF you need to extract a
  game-mechanic palette constant (suit colors).

**DO NOT touch**:
- Any other game
- `packages/**/*`
- `docs/**/*` (orchestrator updates the guide after if you find gotchas;
  add them to your resolution doc instead)
- Tests

## Task

For EVERY hex color you find in `games/liar-bar/Board.tsx`:

1. Decide its **intent** from context (semantic use or game-mechanic):
   - Destructive action / "shot / out" / challenge → `destructive`
   - Success / "lucky alive" / believe → `success`
   - Warning / amber emphasis → `warning`
   - Skeuomorphic shadow offset (`#1a1108`) → `shadow`
   - Primary text / border / foreground → `foreground`
   - Suit color (Q blue, K purple, A green, Joker red) → **game-mechanic
     palette** (extract if not already extracted)

2. Replace per the patterns in §"Pattern examples" of the migration guide:
   - `border-[#d94040]` → `border-destructive`
   - `bg-[#fde8e8]` → `bg-destructive/10` (tint)
   - `text-[#d94040]` → `text-destructive`
   - `shadow-[Npx_Npx_0px_0px_#d94040]` → `shadow-[Npx_Npx_0px_0px_hsl(var(--destructive))]`
   - `border-[#1a1108]` → `border-[hsl(var(--shadow))]` (or `border-shadow` if Tailwind has picked it up — try `border-shadow` first; if it doesn't match the visual, fall back to the arbitrary value form)
   - `shadow-[Npx_Npx_0px_0px_#1a1108]` → `shadow-[Npx_Npx_0px_0px_hsl(var(--shadow))]`

3. **Game-mechanic palettes** (liar-bar suit colors):
   The `bgByCard`, `borderByCard`, `textByCard` maps at the top of `Board.tsx`
   are canonical suit identities (Q is blue, K is purple, etc.), NOT theme
   tokens. Keep them as hex values but:
   - Extract them to a single exported const `SUIT_COLORS` in
     `games/liar-bar/shared.ts` (if `shared.ts` doesn't have a place for
     UI-layer colors, create the export). Structure:
     ```ts
     // Suit colors are canonical game-mechanic identities, not theme tokens.
     // A Q stays blue across themes; a K stays purple. Intentionally hex
     // literal so theme swaps cannot inadvertently break card recognition.
     export const SUIT_COLORS = {
       Q: { bg: '#e8f0fe', border: '#2563eb', text: '#2563eb' },
       K: { bg: '#f0e8fe', border: '#7c3aed', text: '#7c3aed' },
       A: { bg: '#e8f8ee', border: '#16a34a', text: '#16a34a' },
       Joker: { bg: '#fde8e8', border: '#d94040', text: '#d94040' },
     } as const;
     ```
   - Import and use in Board.tsx. Tailwind arbitrary-value class still
     works with dynamic values: `className={\`border-[${SUIT_COLORS[card].border}]\`}` — but this won't be picked up by Tailwind JIT at build time.
     Instead use inline style: `style={{ borderColor: SUIT_COLORS[card].border }}`. That's the correct pattern for dynamic theme-bypassing colors.

4. **Alpha tints** — when you see a hex like `#fde8e8` (destructive at ~10%
   tint) or `#e8f8ee` (success at ~10% tint), replace with the `/10` alpha
   modifier on the token: `bg-destructive/10`, `bg-success/10`. Don't try to
   match the exact rgba; the `/10` convention is used throughout the app.

## Verification — MANDATORY

After edits:

1. **Zero remaining semantic hex**: `rg -o '#[0-9a-fA-F]{6}' games/liar-bar/Board.tsx` — every remaining hit should be a game-mechanic SUIT_COLORS reference in shared.ts or an intentional scene accent. No `#d94040` / `#16a34a` / `#d97706` / `#1a1108` / `#3d2e1e` should survive directly in Board.tsx.
2. **Typecheck**: `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck' | tail -3` exit 0.
3. **Liar-bar tests**: `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/liar-bar && pnpm exec vitest run 2>&1' | tail -10` — all pass.
4. **Visual snapshot** (if dev server is up at :5173): capture a screenshot
   of the game and describe any visible regression in your resolution doc.

## Done criteria

Create `docs/ISSUE_liar-bar-token-migration-resolution.md` with:
- Before/after counts (should go from 27 hex to ~12 hex, all inside SUIT_COLORS)
- List of unique tokens used and how many replacements each
- Any gotchas you discovered (for updating the guide)
- Typecheck + test output
- Print `git status -s` and exit. DO NOT commit.

## Anti-patterns — DO NOT DO

- Batch `sed` replacement — you WILL break something subtle (e.g. the
  `#fde8e8` challenge button background needs `/10` tint, but `#fde8e8`
  also appears in the `bgByCard.Joker` map where it should stay as hex).
  Read each hit in context.
- "While I'm here, let me refactor" — stay ruthlessly in scope.
- Invent a new token — ask instead.
- Touch `packages/client/src/index.css` — the orchestrator already added
  `--shadow`.

Begin now.
