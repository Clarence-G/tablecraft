# Texas Hold'em Token Migration — Resolution

## Before / After hex counts

| File | Before | After | Notes |
|---|---|---|---|
| `games/texas-holdem/Board.tsx` | 29 | 3 | 3 remaining are `var(--scene-accent, #d4a056)` — intentional keep |
| `games/texas-holdem/shared.ts` | 0 | 3 | New `POKER_CHIP_COLORS` palette (mechanic identity hex) |

## Semantic hex migrated (20 replacements)

| Hex | Token | Context |
|---|---|---|
| `#d97706` | `text-warning` / `focus:border-warning` | `statusColor.all_in`, input focus ring |
| `#fef3e0` | `hover:bg-warning/10` | `btnActive` hover tint |
| `#d94040` (×8) | `text-destructive` / `border-destructive` / `bg-destructive/10` / `shadow-[…hsl(var(--destructive))]` | `statusColor.eliminated`, `btnDanger`, error message |
| `#fde8e8` (×2) | `bg-destructive/10` | `btnDanger`, error message bg |
| `#16a34a` (×4) | `text-success` / `border-success` / `bg-success/10` / `shadow-[…hsl(var(--success))]` | Showdown result panel |
| `#e8f8ee` | `bg-success/10` | Showdown result panel bg |

## Structural hex migrated (3 replacements)

| Hex | Token form | Context |
|---|---|---|
| `#1a1108` (×3) | `shadow-[…hsl(var(--shadow))]` | Raise confirm button, action area panel, players list panel |
| `#3d2e1e` (×1) | `shadow-[…hsl(var(--foreground))]` | `btnActive` 2px shadow offset |

## Game-mechanic palette extracted

Extracted to `POKER_CHIP_COLORS` in `games/texas-holdem/shared.ts`.

**Colors extracted (6 instances removed from Board.tsx):**
- `#f5ecd6` — dealer button chip background (warm ivory)
- `#4a3528` — dealer button chip text (dark brown)
- `#8b6f3d` — chip gold: dealer button border, bet indicator text, chip dot ring, pot chip dot outline

**Why not tokens:** These are canonical game-mechanic identities. The dealer "D" button and the chip/bet indicator dots represent actual poker chip gold. A theme change must not accidentally make them look like generic UI elements. Follows the exact two-field `{ *Class, hex }` pattern from the liar-bar pilot (`SUIT_COLORS`).

**Const name:** `POKER_CHIP_COLORS` (exported from `shared.ts`, imported in `Board.tsx`).

## Intentional exceptions (keep-as-is)

All 3 remaining hex in `Board.tsx` are `#d4a056` inside `var(--scene-accent, #d4a056)` CSS-var fallback patterns. Per the guide, these are already the correct theming pattern and must not be touched.

## Verification output

### Zero semantic hex in Board.tsx

```
$ grep -n '#[0-9a-fA-F]{6}' games/texas-holdem/Board.tsx
134:  bg-[var(--scene-accent,#d4a056)]   ← scene accent var() fallback
401:  background: 'var(--scene-accent, #d4a056)' ← scene accent var()
408:  color: 'var(--scene-accent, #d4a056)'       ← scene accent var()
```

### Typecheck

```
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(exit 0 — no errors)
```

### Game tests

```
RUN  v1.6.1
✓ |texas-holdem| logic.test.ts  (27 tests) 6ms
Test Files  1 passed (1)
Tests  27 passed (27)
```
