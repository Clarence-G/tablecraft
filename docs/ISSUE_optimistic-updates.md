# Optimistic updates for game actions

## Architecture

### The two options

1. **Full client-side reducer.** Ship `GameLogic.onAction` to the browser and
   run it locally to compute an optimistic state before the server confirms.
   Rejected: server state shape (`TState`) differs from the per-player view
   (`TView`); reproducing the view-projection logic client-side duplicates the
   game engine and is fragile for games with hidden information (cards, roles,
   secret bids).
2. **Per-call optimistic view overlay.** Extend `BoardProps.sendAction` with
   an optional `optimisticView?: TView` argument. The Board — which already
   knows both the current view and the intent of the action — computes the
   predicted next view and hands it to the hook. `useGame` layers this overlay
   on top of the authoritative state and clears it on any terminal signal.

We implemented **option 2**. It keeps the engine server-side, leaves
view-projection rules in one place, and lets each Board opt in per-action
(only where the prediction is cheap and obviously right).

### Why assume HIT (not MISS) for Battleship fire

Under heuristic expected value a miss is more common than a hit, but the UX
cost is asymmetric:

- Optimistic **HIT → actual MISS**: the red "X" flashes briefly, then flips
  to a grey dot. The misprediction *looks like* the server corrected you — a
  beat of tension that feels consistent with the game's "reveal" loop.
- Optimistic **MISS → actual HIT**: the grey dot flashes, then flips to a
  red "X". Robbing the player of the hit reaction (the most rewarding moment
  in the game) and then awkwardly giving it back a tick later feels worse
  than the alternative.

Given that the whole point of optimistic rendering is to make the UI feel
better, we bias toward the outcome whose misprediction is the least
disappointing.

## Changes applied

| File | Change |
|------|--------|
| `packages/client/src/hooks/useGame.ts` | `GameSnapshot` now has `authoritativeState` + `optimisticView`. `sendAction(action, optimisticView?)` stores the overlay. `game:state`, `game:reject`, and the 3s send-timeout all clear it. Return value exposes `view = optimisticView ?? authoritativeState` alongside `authoritativeState`. `GameStore` class is exported for unit testing. |
| `packages/shared/src/types/board.ts` | `BoardProps.sendAction` signature extended with optional `optimisticView?: TView`. Existing Boards compile unchanged. |
| `packages/client/src/pages/Game.tsx` | Destructures `view` from the hook and passes it to `<Board state={view} />`. |
| `games/battleship/Board.tsx` | Fire click now constructs a predicted `PlayerView` (`myShots[idx] = 2`, `currentPlayer = opponent`) and passes it as the second arg to `sendAction`. Placement is unchanged — `localGrid` already makes it visually optimistic until `place_ships` is confirmed. |
| `packages/client/src/hooks/useGame.test.ts` | New. Five unit tests on `GameStore` covering the cases in "Edge cases handled". |

## Other games TODO

Games where an optimistic overlay would reduce perceived latency but which
are **not** implemented in this pass:

- **blackjack** — on `hit`, append a placeholder card to the player's hand
  and mark turn-advance if bust is impossible; clear on `game:state`. Needs
  a sentinel "?" card value since the actual draw is server-RNG.
- **uno** — on `play_card`, remove the played card from the optimistic hand
  and push it onto the discard pile top; flip `currentPlayer` to next seat.
  Skip / reverse / draw-two effects can also be mirrored optimistically.
- **connect-four / gomoku** — drop the placed piece immediately, flip turn.
  These are fast-to-server today, so latency isn't as visible — low priority.
- **texas-holdem** — betting actions (check/call/raise) where the amount is
  fully known client-side can advance the pot + move turn optimistically.
- **liar-bar** — bid increments are deterministic; could advance seat indicator
  optimistically.

In every case the overlay must be deterministic from `(view, action)` — any
action whose outcome depends on server RNG (card draw, dice, hidden reveals)
should only overlay the parts that are known, and use the current view for
the rest.

## Edge cases handled

1. **Reject rollback.** `game:reject` clears `optimisticView` and `isSending`;
   `view` falls back to the last `authoritativeState`. The user sees the state
   snap back to pre-click.
2. **Race with real state.** If `game:state` arrives (e.g. a bot action,
   concurrent broadcast) before the client's own `game:state` for the pending
   action, the overlay is cleared and the incoming view wins. The overlay is
   always cleared on *any* `game:state`, not selectively — simpler and safer
   than trying to match seq ids.
3. **Server silence / dropped packet.** The existing 3s `SEND_TIMEOUT_MS`
   now *also* clears `optimisticView` in addition to `isSending`. Without
   this, a dropped socket would leave a fake state on screen indefinitely.
4. **Double-click guard.** `sendAction` early-returns when `isSending` is
   already `true`, so rapid clicks can't stack overlays.
5. **Unrelated server broadcasts.** Notifications (`game:notify`) do not
   touch the optimistic overlay — they're a side channel.

## Validation output

```
$ pnpm typecheck
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
(clean)

$ pnpm --filter @games/battleship test
Test Files  1 passed (1)
Tests       22 passed (22)

$ pnpm vitest run --project client src/hooks/useGame.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)

$ pnpm test
Test Files  35 passed (35)
Tests       517 passed (517)
```

(Workspace-wide `pnpm test` surfaces 15 preexisting `html-encoding-sniffer`
unhandled errors from the jsdom dependency chain; these exist on `main` prior
to this change and do not cause any test file to fail.)
