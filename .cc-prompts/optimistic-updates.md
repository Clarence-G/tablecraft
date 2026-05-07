# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# PARALLEL ROLLOUT NOTICE
You are running in parallel with sibling CC workers on other features. Other files in the working tree may be modified by them — this is EXPECTED, not a corruption. Do NOT `git stash`, `git reset`, `git checkout`, or otherwise discard untracked/unstaged changes. If `pnpm typecheck` fails on a file you didn't touch, read it and adapt your own files to the new contract.

---

# TASK: Optimistic updates for game actions — reduce perceived latency

On TableCraft, when a player clicks to submit an action (fire a shot, drop a piece, play a card), the UI currently waits for the server's `game:state` broadcast before showing the result. Over a slow network this feels sluggish. Your job: add **optimistic rendering** — show the action's effect immediately on click, then reconcile with the authoritative server state when it arrives.

## Project path
`/Users/bytedance/Projects/tablecraft`

## Background — READ FIRST (do not skip)

Read in this order:
1. `packages/client/src/hooks/useGame.ts` (135 lines — this is the hook you'll extend)
2. `packages/shared/src/types/room.ts` — find `BoardProps` definition; understand the `sendAction` surface
3. `games/battleship/Board.tsx` — search for `sendAction` call sites; `handlePlacementClick` and the fire-phase `onCellClick` handler are where optimistic updates matter most
4. `games/battleship/logic.ts` — understand the server-side reducer shape (so your client-side optimistic reducer is compatible)
5. `packages/shared/src/game.ts` (or wherever `GameLogic` is defined) — look for the shared interface `GameLogic<State, Action, View>`

## What to build

### Design constraint — two viable architectures, pick #2

**Rejected approach**: run the full `GameLogic.onAction` reducer client-side to compute optimistic state. Too invasive (server state shape ≠ player view shape; would require shipping full engine to client).

**Chosen approach (implement this)**: expose a **per-game optional `optimisticReducer`** on the client plugin that takes `(view, action, myId) => view | null`. Returns `null` when optimistic rendering isn't safe for this action. The `useGame` hook applies it on `sendAction`, rolls back on `game:reject`, and replaces on `game:state` arrival.

### Concrete file changes

#### A. `packages/client/src/hooks/useGame.ts` — extend `GameStore`

Add optimistic snapshot layering:
- Track an `optimisticView: unknown | null` in `GameSnapshot`. When set, it overrides `state` for rendering.
- `sendAction` accepts an optional `optimisticView` argument. When provided: set `optimisticView` immediately, then emit as before.
- `game:state` handler: clear `optimisticView` (server truth arrived).
- `game:reject` handler: clear `optimisticView` (rollback).
- Send-timeout (3s): ALSO clear `optimisticView` — don't leave a fake state on screen if the server vanished.
- The returned snapshot should expose an **effective view**: `view: optimisticView ?? state`. Update the return signature so callers read `view` (rename `state` → `view` in the snapshot, OR add a new `view` field alongside `state`; pick cleaner one, update all call sites).

Make sure the existing `isSending` flag still flips correctly — it should be `true` from click until EITHER `game:state` or `game:reject` arrives.

#### B. `packages/client/src/hooks/useGame.ts` — public API shape

Current return: `{ state, lastReject, notifications, matchStartedAt, isSending, sendAction }`.

New return: `{ view, authoritativeState, lastReject, notifications, matchStartedAt, isSending, sendAction }` where:
- `view` is the effective rendering snapshot (optimistic overlay or authoritative)
- `authoritativeState` is the confirmed server state (renamed from `state` to make the distinction explicit)
- `sendAction(action, optimisticView?)` — second arg optional, falls back to current behavior when omitted

Update `packages/client/src/pages/Game.tsx` and any other `useGame` consumers to use `view` where they currently use `state`.

#### C. `packages/shared/src/types/board.ts` (or wherever `BoardProps` lives) — extend

Add optional second argument to `BoardProps.sendAction`:
```ts
sendAction: (action: Action, optimisticView?: View) => void;
```

#### D. `games/battleship/Board.tsx` — wire optimistic fire

Only for the `fire` action (placement is already visually optimistic via `localGrid`):
- When the player clicks an enemy cell to fire, BEFORE calling `sendAction`:
  - Compute an optimistic view: clone current view, set `enemyShots[idx] = 2` (optimistically assume hit) OR `enemyShots[idx] = 1` (optimistically assume miss).
  - **Decision**: assume HIT (2) optimistically — feels more rewarding; on miss the grid corrects a half-second later. Document this in the ISSUE doc.
  - Also bump `currentPlayer` to the opponent's id in the optimistic view, so the "你的回合" indicator flips immediately.
- Pass the optimistic view as the 2nd arg to `sendAction`.
- Do NOT apply optimistic rendering for `place_ships` — that action has a complex placement set and is already client-local until confirmed.

#### E. Unit tests

Add `packages/client/src/hooks/useGame.test.ts` with these cases:
- `sendAction` without optimisticView: behavior unchanged (isSending flips, state updates on `game:state`)
- `sendAction` with optimisticView: `view` returns optimistic immediately
- `game:state` arrival: optimistic cleared, `view === authoritative`
- `game:reject`: optimistic cleared, `view === last authoritative`
- Send-timeout 3s: optimistic cleared even without server response

Use `vitest` + a mocked `Socket` (see existing tests in the repo for the pattern; `packages/client/src/hooks/useChat.test.ts` if it exists, or `packages/game-ui/src/log/useGameLog.test.tsx` as reference for React hook testing style).

## Scope fence (files you may touch)
- `packages/client/src/hooks/useGame.ts` + new `useGame.test.ts`
- `packages/client/src/pages/Game.tsx` (just renames: `state` → `view` / `authoritativeState`)
- `packages/shared/src/types/board.ts` (or the file that exports `BoardProps` — find it)
- `games/battleship/Board.tsx` (only for the `fire` action optimistic wiring)

**Do NOT** touch:
- Any other `games/*/Board.tsx` (sibling worker handles Battleship visual polish; you only wire the fire-optimistic bit)
- `packages/server/**`, `packages/cli/**`, `skill_data/**`
- `packages/game-ui/**`

## TableCraft iron rules
1. **i18n strict**: zero hardcoded CJK in `.tsx`/`.ts`. No `defaultValue` with non-ASCII.
2. **No commit, no push.** Orchestrator commits.
3. **Typecheck is truth**: trust `pnpm typecheck` end-to-end; ignore `patch` tool's inline TS lint noise.
4. **Don't break existing tests**: `pnpm test` and `pnpm typecheck` must be green when you're done.

## Validation
```bash
cd /Users/bytedance/Projects/tablecraft
pnpm typecheck
pnpm --filter battleship test
pnpm --filter @repo/client test 2>/dev/null || pnpm test   # whichever finds useGame.test.ts
```

## Deliverables
1. `useGame.ts` with optimistic-view layering.
2. `useGame.test.ts` with the 5 test cases above, all green.
3. `BoardProps.sendAction` extended.
4. `Game.tsx` updated for new hook return shape.
5. `Battleship Board.tsx` fire-action wired optimistically.
6. ISSUE doc at `docs/ISSUE_optimistic-updates.md` with sections:
   - **Architecture** (the per-game `optimisticReducer` decision, why HIT-not-MISS)
   - **Changes applied**
   - **Other games TODO** (enumerate which games could benefit from optimistic later — blackjack card draw, uno play, etc. — but NOT implemented now)
   - **Edge cases handled** (timeout, reject, race with real state)
   - **Validation output**

START NOW.
