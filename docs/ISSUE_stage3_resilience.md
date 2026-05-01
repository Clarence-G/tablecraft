# Stage 3 — Socket.io Resilience E2E Specs

## Summary

Two Playwright specs validate the reconnect + state-replay flow that Stage 2 wired into the server (`room:resume` ack, `markDisconnected` / `markReconnected`, `persistState`). Both drive a real browser socket drop against the main dev servers (`:5173` + `:3001`), force the client transport closed, then reconnect and assert that the user-visible board state matches what the server is authoritative on.

Deliverables:
- `tests/e2e/specs/resilience/reconnect.spec.ts` — basic reconnect flow
- `tests/e2e/specs/resilience/message-replay.spec.ts` — catch-up on moves made while offline
- `tests/e2e/helpers/socketDrop.ts` — shared `dropSocket(page)` / `reconnectSocket(page)` helpers
- `packages/client/src/hooks/useSocket.ts` — one test-only line exposing the socket singleton as `window.__socket` (gated on `import.meta.env.DEV || MODE === 'test'`)

## How the socket drop is simulated

The client's socket.io singleton already lives in `useSocket.ts` (there is no `lib/socketClient.ts` file). In dev/test mode we now assign `window.__socket = socketInstance` right after `io(...)` creates it. The Playwright helpers then do:

```ts
await page.evaluate(() => window.__socket.disconnect());
// ...
await page.evaluate(() => window.__socket.connect());
```

Why this approach instead of CDP-level frame injection:
- The socket.io client wraps WebSocket/long-polling transports, with its own ack/replay plumbing. CDP `Network.emulateNetworkConditions` would cut the browser's WebSocket at the transport layer, but it also cuts all HTTP (so we can't reuse it selectively) and does not play cleanly with the client's reconnection backoff.
- `socket.disconnect()` / `socket.connect()` mimics the exact behavior the prod client exhibits when its transport dies (navigate-away → come-back, laptop sleep, brief wifi drop). The server-side handler path is identical: `disconnect` event → `markDisconnected` → new connection with same `userId` → `io.on('connection')` auto-rejoin branch.
- The `window.__socket` exposure is gated on Vite's `import.meta.env.DEV` / `MODE === 'test'`, so prod bundles remain clean.

The helpers also `waitForFunction` on `connected === false` / `=== true` rather than using fixed sleeps, so the specs don't wait longer than strictly necessary.

## Specs

### `reconnect.spec.ts` — basic reconnect flow
1. Alice + Bob seed guest identity, Alice creates a gomoku room, Bob joins, both ready up, Alice starts.
2. Alice (host → black) plays `[7,7]`. Both pages confirm the black stone renders (via `aria-label="8,8 (black)"` on the `data-row=7,col=7` cell — the format IntersectionBoard emits).
3. `dropSocket(alice)` closes her transport; a 1 s beat lets the server run `markDisconnected`.
4. `reconnectSocket(alice)` reopens; server's `io.on('connection')` finds her room via `roomManager.findRoomByUser`, calls `markReconnected`, re-emits `room:state` + `game:state`.
5. **Assertions**:
   - Alice's board still shows the black stone at `[7,7]` after reconnect.
   - Bob plays `[8,8]` (his turn); Alice observes the white stone on her reconnected socket.
   - Alice plays `[6,6]`; Bob observes it — confirming outbound events work post-reconnect.

### `message-replay.spec.ts` — catch-up on missed moves
1. Same setup; Alice plays `[7,7]` first.
2. `dropSocket(alice)` + short beat.
3. **While Alice is offline**, Bob plays `[5,5]`. Gomoku's turn logic forbids two consecutive Bob moves, so the spec validates the "A missed at least 1 B event and catches up" requirement with a single missed move (the adaptation the task doc explicitly allowed).
4. Pre-reconnect sanity: Alice's DOM does not yet contain `[5,5]` as white.
5. `reconnectSocket(alice)` — server re-emits `game:state`; Alice's `useGame` hook replaces its state.
6. **Assertions**:
   - Alice sees both `[7,7]` (her own, black) and `[5,5]` (Bob's, white).
   - Alice plays `[6,6]` (her turn again); Bob observes it.

## Timing tricks

- `dropSocket` first waits for `window.__socket.connected === true` before disconnecting — prevents a race where the spec calls `disconnect` on a socket that hasn't finished handshaking.
- The only fixed sleep is a 1 s / 0.5 s `waitForTimeout` between `dropSocket` and the next action, which gives the server a beat to run `markDisconnected` (plus, for the replay spec, ensures Bob's move is attributed to the post-drop window). Everything else uses `waitFor` / `expect().toHaveAttribute()` with the default 8 s polling.
- `expectStone` uses `toHaveAttribute('aria-label', ...)` rather than a `toBeVisible` or screenshot — the board paints stones via framer-motion enter animations, so matching the aria-label (which updates synchronously when `state.board` changes) is more stable than waiting on animation frames.

## Validation

```
$ pnpm typecheck
  (clean)

$ pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line   # run 1
  2 passed (6.1s)

$ pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line   # run 2
  2 passed (6.4s)

$ pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line   # run 3
  2 passed (6.3s)
```

3/3 runs green across both specs.

## Out of scope / follow-ups

- **Server log assertion** — the task flagged "Server log (optional, skip if hard) contains `mod:reconnect`". Skipped: the main `pnpm dev` server doesn't pipe stdout to a file the specs can read (`server-log.ts` fixture would require a new isolated-server setup per spec). The behavior is already covered indirectly: the server only emits `room:state` + `game:state` from the auto-rejoin branch, and our assertions require that emit to have fired.
- **Authenticated (email) users** — the task suggested `signUpEmail` from `helpers/auth.ts`. The specs instead use `seedGuestIdentity`, matching prior art (`rooms/gomoku-full-game.spec.ts`, `rooms/spectate.spec.ts`). Reconnect logic is identity-agnostic — `roomManager.findRoomByUser` keys on `userId` regardless of guest vs. email-authenticated. Using guests avoids per-run email uniqueness and keeps the spec deterministic.
- **Mid-flight action loss** — not tested. If Alice emits `game:action` at the exact instant her transport closes, the event may be dropped. The Stage 2 feature set does not attempt to replay pending client→server actions across a reconnect (only server→client state replay). If a future spec is needed for that case, it should exercise `lastSeq` on `GameRoom` and be explicit about the at-least-once vs. at-most-once contract.
- **Transport-level drop via CDP** — not implemented. If ever the `window.__socket` exposure becomes unacceptable even in dev, the replacement is `Network.emulateNetworkConditions` with `offline: true` toggled via Playwright's CDP session. Left as a follow-up because it buys nothing behaviorally.
