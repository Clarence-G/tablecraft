# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped e2e-authoring task. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# Stage 3 worker: Socket.io resilience e2e specs

You are an e2e-test authoring worker on TableCraft. Add 2 Playwright specs that exercise socket.io connection resilience (reconnect flow + message replay after reconnect). Stage 2 reconnect feature has already landed in server code (`room:resume`, `markDisconnected`/`markReconnected`, `persistState`); this stage is about **validating it e2e with real socket drops**.

Working dir: `/Users/bytedance/Projects/boardgames`

## Prior art — read FIRST

- `tests/e2e/specs/rooms/gomoku-full-game.spec.ts` — full multi-player e2e template (uses `bots.ts` helper)
- `tests/e2e/specs/rooms/spectate.spec.ts` — socket emit pattern
- `tests/e2e/specs/rooms/spectator-view-read-only.spec.ts`
- `tests/e2e/helpers/bots.ts` — `botAction`, socket helper, look at how it emits `game:action`
- `tests/e2e/helpers/auth.ts` — sign-up helper
- `tests/e2e/fixtures/server-log.ts` — isolated server fixture (if needed, but prefer main dev server :3001)
- `packages/server/src/socket/handlers.ts` — search for `room:resume` and `markDisconnected` to understand server-side flow
- `packages/server/src/engine/GameRoom.ts` — `persistState()` saves state on change; on socket reconnect server replays full state

## What to build

### Spec 1: `tests/e2e/specs/resilience/reconnect.spec.ts`

Scenario "player rejoins their in-progress game after socket drop":

1. Two users A + B sign up via `tests/e2e/helpers/auth.ts`.
2. A creates a gomoku room, B joins. Game starts. A makes 1 move (plays `[7,7]`). Game state persists.
3. **Simulate A's socket drop**: use Playwright's `page.evaluate` to disconnect the underlying socket.io client. Recipe:
   ```ts
   await pageA.evaluate(() => {
     // @ts-expect-error — socket client stored on window for tests
     window.__socket?.disconnect();
   });
   ```
   If `window.__socket` isn't exposed, ADD minimal test-only plumbing: in `packages/client/src/lib/socketClient.ts` (or wherever the socket singleton lives), in dev/test mode expose it as `(window as any).__socket = socket`. Gate with `if (import.meta.env.DEV || import.meta.env.MODE === 'test')`. This is acceptable test infra; not a real prod leak.
4. Wait 1 s. Server should have called `markDisconnected(A)`.
5. Reconnect by calling `socket.connect()` on A's page. On connect, client auto-emits `room:resume`, server sends full `room:state` + `game:state`.
6. **Assert**:
   - A's browser still shows the gomoku board with the stone at `[7,7]` visible.
   - A can still play — make move `[8,8]`, B receives the update.
   - Server log (optional, skip if hard) contains `mod:reconnect`.
7. Teardown: both sockets leave.

### Spec 2: `tests/e2e/specs/resilience/message-replay.spec.ts`

Scenario "actions taken while A is disconnected are visible to A on reconnect":

1. Two users A + B, gomoku room, game started (same setup as Spec 1).
2. A disconnects (same recipe).
3. **While A is disconnected**, B plays 2 moves (e.g. `[5,5]` then `[6,6]`). These persist server-side. A is not receiving updates.
4. A reconnects. Server replays current state via `game:state`.
5. **Assert**:
   - A's board shows BOTH of B's stones (`[5,5]` and `[6,6]`).
   - A sees "your turn" indicator (since after B's 2 moves, it's A's turn again? actually after B alternating: A→B→B — server logic determines). Adjust assertion to match real turn logic: whoever's turn the server says it is, A's UI reflects it.
6. A plays a move, B sees it.

If gomoku turn logic doesn't allow 2 consecutive B moves, adapt: A plays, B plays, A disconnects, B plays, A reconnects. The point is **A missed at least 1 B event and catches up**.

## TableCraft iron rules

1. **i18n**: Any new strings you might render on the page through a helper → go through i18n. But specs typically don't render UI — they assert against locale keys via `import zh from '../../../packages/client/src/i18n/locales/zh/common.json'`. Follow the existing pattern in `tests/e2e/specs/leaderboard/period-switching.spec.ts`.

2. **No `test.fixme`**: ship working specs or document in ISSUE doc as "could not implement because X". Don't commit disabled tests.

3. **Main dev server**: TableCraft dev server is running on :3001 (rate limit 3000, already raised for e2e). Use `http://localhost:5173` (client) + `http://localhost:3001` (server). Do NOT kill or restart it. If you need an isolated server, use the `server-log.ts` fixture pattern, but prefer the main one.

4. **`window.__socket` exposure**: acceptable test-only plumbing, gated by `import.meta.env.DEV || MODE === 'test'`. Don't leak to prod. If you can avoid the exposure by using Playwright's CDP-level network interception to force-close the socket.io WebSocket frame, even better, but `window.__socket` is acceptable.

5. **Typecheck is truth**: `pnpm typecheck` end-to-end.

6. **Don't touch other workers' files**: scope below.

## Scope fence (editable paths)

- `tests/e2e/specs/resilience/` (NEW dir)
- `tests/e2e/helpers/` (you may add a helper here, e.g. `socketDrop.ts`, if both specs share disconnect logic)
- `packages/client/src/lib/socketClient.ts` (minimal test-only `window.__socket` exposure, gated)
- `docs/ISSUE_stage3_resilience.md` (new, your report)

**Do NOT touch**: server source, game logic, fixtures, or any other spec.

## Validation

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line
# Run 3 times to check for flakiness
pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line
pnpm exec playwright test tests/e2e/specs/resilience/ --reporter=line
```

Both specs must pass 3/3 times. If they flake, diagnose timing (use `waitFor` with explicit visible assertion, not `waitForTimeout`). Escalate only after genuine investigation.

## Deliverables

1. 2 spec files under `tests/e2e/specs/resilience/`
2. Any shared helper under `tests/e2e/helpers/`
3. `window.__socket` exposure (if needed) in `packages/client/src/lib/socketClient.ts`, dev/test-gated
4. `pnpm typecheck` green
5. Both specs pass 3/3 runs
6. `docs/ISSUE_stage3_resilience.md` with sections:
   - Summary
   - How the socket drop is simulated + why that approach
   - Full spec list + assertions
   - Any timing tricks needed
   - Validation output (3 runs)
   - Anything out of scope / follow-up

START NOW.
