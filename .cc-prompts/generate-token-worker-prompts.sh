#!/usr/bin/env bash
# Generate per-game token migration prompts from a shared template.
#
# After running, you get .cc-prompts/tokens-<game>.md for each game not yet
# migrated. Launch them with launch-worker.sh.
#
# Usage: bash .cc-prompts/generate-token-worker-prompts.sh

set -euo pipefail

PROJECT=/Users/bytedance/Projects/tablecraft
PROMPTS="$PROJECT/.cc-prompts"

# Game → (hex count, has-game-mechanic-palette?, palette-description)
# liar-bar is the pilot, excluded.
declare -a GAMES=(
  "battleship|22|YES|Ship hull cells use hard blue for ships, red for hits, blue-grey for water. Extract to SHIP_COLORS in shared.ts with fields {hull, hit, miss}."
  "blackjack|25|NO|All hex values map to semantic tokens (destructive for bust/lose, success for win/blackjack, warning for push/active). No game-mechanic palette to extract."
  "gomoku|6|YES|Black/white stone colors are game-mechanic (#1a1108 near-black, #ffffff white). Keep as hex inside a STONE_COLORS const in games/gomoku/shared.ts if not already structured."
  "hive|14|YES|Piece fills are game identities: white-player pieces vs black-player pieces. The per-bug accent stroke (queen amber, ant gold, etc.) is decorative. Extract PIECE_COLORS to shared.ts."
  "splendor|37|YES|GEM_BG_COLORS / GEM_FG_COLORS already structured at lines 28-42 — just add a comment that they're canonical game-mechanic palette. Semantic hex elsewhere (shadows, primary surfaces) migrate to tokens."
  "texas-holdem|29|NO|Felt/placeholder colors are --scene-* based — leave alone. All remaining hex are semantic (destructive for eliminated, warning for all_in, success for showdown-win)."
  "uno|31|YES|COLOR_PALETTES at line 13-19 IS the game — extract to UNO_COLORS in shared.ts as canonical game-mechanic palette. Shadow-offset hex migrate to --shadow token."
  "yahtzee|32|MIXED|#0c1a2e and #2a1f14 are scene-specific dark shadows — may be intentional deeper offsets for the darker yahtzee scene. Confirm by checking --scene-ambience settings before migrating; if confirmed scene-specific, leave as-is or migrate to a --scene-shadow fallback. All other hex migrate normally."
)

for entry in "${GAMES[@]}"; do
  IFS='|' read -r game count has_palette palette_note <<< "$entry"
  OUT="$PROMPTS/tokens-$game.md"

  cat > "$OUT" <<EOF
# Worker W-$game-tokens — hex → token migration

You are migrating hardcoded hex colors in \`games/$game/Board.tsx\` to
semantic design tokens. Follow the established pattern from the pilot
(liar-bar, already merged) verbatim.

**Hex count in this file (approximate, pre-migration)**: $count

## Required reading

BEFORE editing, read in full:
1. \`docs/TOKEN_MIGRATION_GUIDE.md\` — the ground-truth hex→token mapping.
2. \`games/liar-bar/shared.ts\` + \`games/liar-bar/Board.tsx\` — see how the
   pilot handled \`SUIT_COLORS\` (static bgClass + hex for style object) as
   the blueprint for game-mechanic palette extraction.
3. \`packages/client/src/index.css\` lines 40-113 — confirms available
   tokens including the new \`--shadow\` token.

Do NOT invent tokens. If a hex doesn't map, document it in your resolution
doc and leave as-is.

## Game-specific note

$palette_note

## Scope (HARD fence)

**Edit ONLY**:
- \`games/$game/Board.tsx\`
- \`games/$game/shared.ts\` IF needed for a game-mechanic palette extraction
- Nothing else.

**DO NOT touch**:
- Any other game
- \`packages/**/*\` (\`index.css\` already has \`--shadow\` added)
- \`docs/**/*\`
- Tests (unless typecheck forces; avoid if possible)

## Task

For every hex color in the file:

1. Classify intent:
   - **Semantic state**: destructive / success / warning → map to token
   - **Surface/structure**: \`#3d2e1e\` → \`foreground\`; \`#1a1108\` → \`shadow\`
   - **Game-mechanic palette**: extract to \`*_COLORS\` const in \`shared.ts\`
   - **Scene ambience** (\`var(--scene-accent, #xxxx)\`): **KEEP AS-IS**
2. Replace per the guide patterns:
   - \`border-[#d94040]\` → \`border-destructive\`
   - \`bg-[#fde8e8]\` → \`bg-destructive/10\`
   - \`text-[#d94040]\` → \`text-destructive\`
   - \`shadow-[Npx_Npx_0px_0px_#d94040]\` → \`shadow-[Npx_Npx_0px_0px_hsl(var(--destructive))]\`
   - \`border-[#1a1108]\` → \`border-shadow\` (try first) OR \`border-[hsl(var(--shadow))]\`
   - \`shadow-[Npx_Npx_0px_0px_#1a1108]\` → \`shadow-[Npx_Npx_0px_0px_hsl(var(--shadow))]\`
3. For game-mechanic palettes, use the **two-field pattern** (bgClass +
   hex) so Tailwind JIT picks up the class but style-object access still
   works with a hex:
   \`\`\`ts
   export const GAME_COLORS = {
     red: { bgClass: 'bg-[#d94040]', hex: '#d94040' },
     // ...
   };
   \`\`\`
   This is the pattern the liar-bar pilot landed on — copy it.
4. Alpha tints (\`#fde8e8\` etc.) → \`/10\` modifier on the token.

## Verification — MANDATORY

1. **Zero semantic hex remaining**: \`rg -o '#[0-9a-fA-F]{6}' games/$game/Board.tsx\`
   — every remaining hit should be inside a game-mechanic palette
   reference, inside a \`var(--scene-*, #xxxx)\` fallback, or documented
   as an intentional exception in your resolution doc.
2. **Typecheck**: \`zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm typecheck' | tail -3\` — exit 0.
3. **Game tests**: \`zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/$game && pnpm exec vitest run 2>&1' | tail -10\` — all pass.

## Done criteria

Create \`docs/ISSUE_$game-token-migration.md\` with:
- Before/after hex counts
- Any intentional exceptions (and WHY)
- Whether you extracted a palette (and to what const name)
- Typecheck + test output

Print \`git status -s\` and exit. DO NOT commit.

## Anti-patterns

- Batch sed — read each hex in context before replacing.
- Invent new tokens.
- Touch \`packages/client/src/index.css\`.
- "While I'm here, let me refactor" — stay in scope.

Begin now.
EOF
  echo "Wrote $OUT"
done

echo
echo "Launch all 8 with:"
echo "  for g in battleship blackjack gomoku hive splendor texas-holdem uno yahtzee; do"
echo "    bash $PROMPTS/launch-worker.sh tokens-\$g opus high"
echo "    sleep 5"
echo "  done"
