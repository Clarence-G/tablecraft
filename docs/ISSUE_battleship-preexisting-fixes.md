# ISSUE: Battleship UI — hardcoded ship names + placement rotation loss

Two pre-existing issues surfaced during the UI review agent run on 2026-05-07. Both were known gaps carried over from the initial battleship implementation and called out in `docs/ISSUE_battleship-ui-polish.md` as "deferred". Fixed together in this pass.

## Issue 1: `SHIP_NAMES_ZH` hardcoded

**What was wrong**: `games/battleship/shared.ts:102` defined `SHIP_NAMES_ZH: string[] = ['航母', '战列舰', '巡洋舰', '潜艇', '驱逐舰']` and `Board.tsx:194, :223` used it directly for the ShipSelector button labels and the SunkIndicator title tooltips.

Violates the CLAUDE.md §5 "all user-facing strings must go through i18n" rule. English users saw Chinese ship names in hover tooltips.

**Fix**:
- Added `ships.{carrier,battleship,cruiser,submarine,destroyer}` keys to both `games/battleship/i18n/zh.json` and `en.json`.
- Added `SHIP_NAME_KEYS: string[]` export in `shared.ts` matching the order of `CLASSIC_SHIPS` — allows `t(SHIP_NAME_KEYS[i])` to resolve the localized name.
- Updated `ShipSelector` and `SunkIndicator` in `Board.tsx` to use `useTranslation('battleship')` and `t(SHIP_NAME_KEYS[i])`.
- Kept `SHIP_NAMES_ZH` exported for backward compatibility (agents consuming `shared.ts` in tests still get the zh array), but it is no longer used anywhere in the Board UI.

## Issue 2: `handleConfirmPlacement` always wrote `rotation: 0`

**What was wrong**: `games/battleship/Board.tsx:315` reconstructed the `ShipPlacement[]` payload from `localGrid` but hardcoded `rotation: 0` for every ship, regardless of what rotation the player had actually chosen during placement.

Consequences:
- `GET /api/rooms/:id` returned structurally-wrong placements for agents (the server's logic layer got the right cell positions because `place_ships` validates them against `getAbsolutePositions`, which uses the supplied rotation — but if rotation was wrong *and* positions were consistent with a different rotation, validation silently accepted it because the cells happen to match).
- Agents inspecting `view.placements` saw rotation=0 even after a rotated placement, confusing replay tooling and any downstream game-state visualization.

**Fix**:
- Added `const [shipRotations, setShipRotations] = useState<Map<number, number>>(new Map())` state.
- `handlePlacementClick` records `shipRotations.set(selectedShipIdx, rotation)` every time a placement succeeds.
- `handleConfirmPlacement` reads `shipRotations.get(shipIndex) ?? 0` when building the `ShipPlacement` — preserving the player's actual rotation.
- `handleReset` clears `shipRotations`.

**Why row-major anchor scan still works**: `rotateOffsets()` in `shared.ts` calls `normalizeOffsets()` which shifts all offsets so `min(row, col) = (0, 0)`. Thus the top-left cell of a rotated ship's footprint in `localGrid` IS offset (0, 0) for that rotation — so "first occurrence in row-major scan" correctly yields the anchor regardless of rotation, provided we pair it with the right rotation value. Added a clarifying comment to `handleConfirmPlacement`.

## Files changed

| File | Change |
|---|---|
| `games/battleship/i18n/zh.json` | +7 lines (`ships.*` keys) |
| `games/battleship/i18n/en.json` | +7 lines (`ships.*` keys) |
| `games/battleship/shared.ts` | +15 lines (`SHIP_NAME_KEYS` export + doc) |
| `games/battleship/Board.tsx` | Ship-name lookup via `t(SHIP_NAME_KEYS[i])`; `shipRotations` state; `handleConfirmPlacement` reads per-ship rotation; `handleReset` clears it |

## Verification

- `pnpm --filter @games/battleship test` — 22/22 pass (unchanged; these tests exercise `logic.ts`, not Board.tsx).
- `pnpm typecheck` — clean.

Not added (not in scope):
- A Board.tsx test covering rotation preservation — the existing test suite is on `logic.ts`; adding Board-level tests requires React Testing Library setup that battleship doesn't currently have. If we want this covered, do it as part of a broader "per-game Board tests" initiative, not here.
