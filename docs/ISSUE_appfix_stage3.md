# App-fix Stage 3 — Two server bugs blocking e2e fixme

Target date: 2026-05-01. Worker: Claude (Opus 4.7).

## Bug 1 — room join accepted players beyond `maxPlayers`

**Root cause.** `GameRoom.join` (`packages/server/src/engine/GameRoom.ts`) had
three early branches — idempotent-existing-member, "game already started", and
then seating — but no capacity gate. Any socket that emitted `room:join` on a
room that was already at `meta.maxPlayers` but still in the `waiting` status
was seated anyway, because the room can only trip the already-started branch
once `room:start` has flipped `status` away from `waiting`. The race between
the last expected seat filling and the `room:start` emit left a window where a
3rd/Nth player could quietly take a seat.

**Fix.** Inserted a capacity check between the already-started branch and the
seating logic: `if (this.players.size >= this.meta.maxPlayers)` returns
`{ ok: false, error: 'Room is full' }`. The existing members path is unchanged
— a member refreshing into their own full room still hits the idempotent
`has(playerID)` branch first, so rejoin is preserved.

## Bug 2 — server silently ignored spectator `game:action`

**Root cause.** The `socket.on('game:action', …)` handler in
`packages/server/src/socket/handlers.ts` used `findRoomByUser(userId)` to locate
the acting player's room. On a miss it early-`return`ed with no socket emit,
so a spectator socket emitting `game:action` saw no response at all. The
e2e spec expects a `game:reject` inside 3 s; silence meant the spec's
"no rejection received" timeout path was hit.

**Fix.** On the no-room branch, emit
`socket.emit('game:reject', 'Not a player in any active room')` before the
early return. This sends the rejection only to the offending socket
(`socket.emit` targets the sender, not the room), matching the emission
pattern already used inside `GameRoom.handleAction → emitToPlayer`.

### `findRoomByUser` behavior (Bug 2 assumption)

Verified in `packages/server/src/engine/RoomManager.ts:34-38`.
`findRoomByUser` reads a single `userToRoom: Map<string, string>` keyed by
userId. That map is populated only in `onPlayerJoin` (called from
`handlers.ts:room:create` and `room:join`), and cleared by `onPlayerLeave`.
Spectators do not go through `onPlayerJoin` — `room:spectate` only calls
`room.addSpectator(userId, socket.id)` which mutates the `spectators` Map
on the `GameRoom` itself, not the manager's `userToRoom`. Therefore a
spectator-only user returns `undefined` from `findRoomByUser`, confirming
that the no-room branch correctly covers the spectator case. A
player-plus-spectator (plays X, watches Y) correctly routes the
`game:action` to room X — existing behavior, unchanged.

## Files changed

| Path | Reason |
|------|--------|
| `packages/server/src/engine/GameRoom.ts` | Add capacity gate in `join` |
| `packages/server/src/engine/GameRoom.test.ts` | 3 new tests: full-room reject, rejoin idempotency in a full room, already-started takes precedence over capacity |
| `packages/server/src/socket/handlers.ts` | Emit `game:reject` on `game:action` when no player-room |
| `packages/server/src/socket/handlers.test.ts` | 2 new tests: lone socket rejection, spectator-emitted `game:action` rejection |
| `tests/e2e/specs/rooms/create-and-join.spec.ts` | Un-fixme 3rd-player-full-room spec |
| `tests/e2e/specs/rooms/spectate.spec.ts` | Un-fixme spectator-action-rejected spec |
| `tests/e2e/specs/leaderboard/period-switching.spec.ts` | Un-fixme stale sign-up-500 spec |

## Unit-test output

```
> @repo/server@ test /Users/bytedance/Projects/boardgames/packages/server
> vitest run

 ✓ |server| src/engine/GameRoom.test.ts  (19 tests)
 ✓ |server| src/socket/handlers.test.ts  (7 tests)
 ✓ |server| src/lib/moderation.test.ts  (8 tests)
 ✓ |server| src/lib/email.test.ts  (3 tests)
 ✓ |server| src/engine/GameRoom.ledger.test.ts  (2 tests)
 ✓ |server| src/db/db.test.ts  (3 tests)
 ✓ |server| src/lib/auth.test.ts  (4 tests)
 ✓ |server| src/lib/ledger.test.ts  (7 tests)
 ✓ |server| src/socket/auth.test.ts  (6 tests)
 ✓ |server| src/api/reports.test.ts  (8 tests)
 ✓ |server| src/api/token-store.test.ts  (9 tests)
 ✓ |server| src/api/friends.test.ts  (16 tests)
 ✓ |server| src/api/points.test.ts  (17 tests)

 Test Files  13 passed (13)
      Tests  109 passed (109)
```

Pre-fix baseline was 16 GameRoom + 5 handlers. Post-fix: 19 GameRoom
(+3 capacity), 7 handlers (+2 rejection). No regressions.

`pnpm typecheck` exits 0 (shared → game-ui → client).

## e2e status

Pending orchestrator server restart. Although `packages/server/package.json`
`dev` uses `tsx watch` (auto-reload), when this worker probed
`http://localhost:3001/health` the port was closed (`ECONNREFUSED`). The
running dev server described in the task prompt was not reachable from this
worker environment at the time of writing, so the three un-fixme'd specs
(`tests/e2e/specs/rooms/create-and-join.spec.ts:57`,
`tests/e2e/specs/rooms/spectate.spec.ts:67`,
`tests/e2e/specs/leaderboard/period-switching.spec.ts:169`) were not
executed. Orchestrator: please kick the dev server and run

```
pnpm exec playwright test tests/e2e/specs/rooms/ tests/e2e/specs/leaderboard/ --reporter=line
```

to confirm. Unit coverage for both bugs exercises the same code paths the
e2e specs hit, so a green unit run + a fresh dev server should be
sufficient confidence.

## Out-of-scope observations

- `GameRoom.toRoomState()` at line ~395 reports `maxPlayers: this.ctx.players.length || this.players.size` — this is the *seat count at game start*, not `meta.maxPlayers`. For a waiting room this still equals `players.size`, so the lobby UI showing "1/2" or "2/2" works, but clients that need the true cap (e.g. a "Room is full" badge on the waiting screen) currently have to read `meta` separately. Not related to this task.
- `handlers.ts:room:spectate` stores `socket.data.spectatingRoomId` but never validates that the user isn't already a *player* of some other room before letting them spectate. Dual-presence is allowed by design (noted in the task prompt) — just flagging that there is no guard for it anywhere.
- No other stale `test.fixme` referencing Stage-1.5-fixed bugs found under `tests/e2e/specs/`.
