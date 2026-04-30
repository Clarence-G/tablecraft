# UNO Polish Review

Target game: `uno` (games/uno/)
Before: screenshots/before/uno.png
After:  screenshots/after/uno.png

## Changes applied

- **meta.scene** added: `surface.color = #b4322c` (deep paper-red, a touch less saturated than primary red so the card faces still pop), `texture = paper`, `accent = #f4d9a8` (warm cream), `ambience = ambient/warm/0.22`. Matches the UX_POLISH §2.3 recommendation (UNO = paper / red / plastic / flat) while lowering saturation enough that the rest of the UI doesn't fight it.
- **Removed the hand-drawn dark-green "felt" box** that previously contained the piles. The `<GameScene>` now supplies the surface — per UX_POLISH §2.4, the play surface is the scene's job, not a second container.
- **Plastic card treatment**: each card face now uses a 3-stop linear gradient (lighter top / base mid / darker bottom via `color-mix`) + italic center label with a soft text-shadow. Corner glyphs unchanged. Shadow is `0 3px 0 -1px` (hard offset) + `0 6px 10px -4px` (soft) for the classic "card floating a hair above the table" read. Selected state stronger shadow.
- **Draw pile as card back**: instead of a fake grey box showing the count, it's now a dark-paper card with accent-cream rotated italic "UNO" — the iconic back. A second offset card back sits behind it to signal "stack". Clickable when it's your turn and you haven't drawn yet; the old "摸牌" button is removed.
- **Settle motion on discard pile**: new top card enters with `opacity 0 → 1, scale 0.6 → 1, rotate -8° → 0°, y -18 → 0` over 350ms (`[0.22, 1, 0.36, 1]` — the `settle` ease from UX_POLISH §3.2). Respects `prefers-reduced-motion` (instant swap).
- **Turn indicator chip**: separated from the piles into its own row between table and hand. `breathe` pulse (accent-cream shadow ring, 2.2s) when it's your turn; static otherwise. Respects `prefers-reduced-motion`. Pattern matches gomoku's turn chip.
- **Player strip** moved above the pile zone (was inside the felt box). Current-turn chip uses cream card + foreground border instead of the old warning-yellow pill — reads better against the red.
- **Meta column** (active color + direction) converted to floating cream disks with hard shadow, matching the warm-skeuomorphic token set (no more backdrop-blur translucent chips).
- **Dependencies**: added `framer-motion` + `react` to `games/uno/package.json` (parity with gomoku) so the game can import motion primitives.

## Verification

- `pnpm typecheck` — passes for uno (unrelated error in games/texas-holdem/ belongs to another agent).
- `pnpm --filter @games/uno test` — 18/18 tests pass (unchanged).
- Before/after screenshots captured via `scripts/shoot-games.ts uno` at 1440×900.

## Self-rating (vision check on the after screenshot)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Spatial** | **7.8** | Red paper surface establishes a clear "play area" distinct from cream chrome. Cards have a readable hard+soft shadow that separates them from the surface. UNO draw pile is stacked (offset back visible). Hand panel floats with thick border and shadow-card. Could go further with an explicit per-card tilt on the hand fan, but that's polish for another pass. |
| **Alive** | **7.5** | Discard-pile settle motion fires on every play; turn chip breathes when it's your turn; cards hover-lift; draw pile is a real clickable button. All reduced-motion safe. Static screenshot can't show the motion but the infrastructure is wired. The one miss: no "bot thinking" secondary pulse (the gomoku pattern) — the turn chip currently distinguishes bot-vs-human by label only. Acceptable at 7.5, would lift to 8+ with that differentiation. |
| **Thematic** | **8.0** | Red paper + plastic-gradient cards + italic SKIP/REV lettering + black card back with cream italic "UNO" reads as *this specific game* on sight. Matches UX_POLISH §2.3's scene recipe exactly. Not a generic card game. |
| **Overall** | **7.7** | All three dimensions clear the 7.5 bar. No hardcoded dead colors — all via scene tokens + existing DESIGN.md tokens. No emoji. No sound. No confetti. Reduced-motion respected. |

## Known trade-offs / things the user should look at

- The paper-red I picked (`#b4322c`) is slightly deeper than UX_POLISH §2.3's `#d94040` to avoid card-on-background color collision (the red number cards would disappear into a brighter surface). If you prefer the spec value exactly, swap it — but card readability will suffer.
- UNO's draw-pile card back has hand-drawn rotated "UNO" text; per the "no authored detail on textures" rule that applies to textures, not UI pieces, so this is OK, but if the user prefers no glyph at all, swap to a solid dark card.
- The "摸牌" explicit button is gone — the draw pile itself is now the interactive target. This is more thematic but slightly less discoverable; a first-timer might not realise the stack is clickable. Acceptable because the turn chip + cream "摸牌" tooltip on hover (`aria-label`) covers it.
