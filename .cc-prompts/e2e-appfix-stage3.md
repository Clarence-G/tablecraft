# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped server bug-fix task. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# App-fix worker: Two server-side app bugs blocking e2e fixme

You are a bug-fix worker on TableCraft. Fix 2 real server-side bugs that have been blocking pre-existing `test.fixme` in the e2e suite. After your fix, un-fixme the specs so they actually run.

Working dir: `/Users/bytedance/Projects/boardgames`

Dev server currently runs in-background on :3001 (rate limit 3000/min). DO NOT restart it — but after server-code changes, we need it restarted to pick up changes. Leave restart to the orchestrator (me) after you're done; just edit and test.

## Bug 1 — room join accepts players beyond maxPlayers

Spec: `tests/e2e/specs/rooms/create-and-join.spec.ts` line 56 — `test.fixme('third player cannot join a full 2-player gomoku room — BLOCKED: server allows join to full room', ...)`

File: `packages/server/src/engine/GameRoom.ts` — `join(playerID, name, isBot, isGuest)` method (~line 171)

Current behavior: the method checks `status !== 'waiting'` and idempotency but does NOT check `this.players.size >= this.meta.maxPlayers`.

Fix: if room is full (and playerID is not already a member), return `{ ok: false, error: 'Room is full' }` BEFORE the idempotent branch, but keep idempotency for existing members (someone rejoining their own full room must still succeed).

Order must be:
1. If `this.players.has(playerID)` → return `{ ok: true }` (idempotent, even when full)
2. If `this.status !== 'waiting'` → return `{ ok: false, error: 'Game already started' }`
3. **NEW**: If `this.players.size >= this.meta.maxPlayers` → return `{ ok: false, error: 'Room is full' }`
4. Seat + add player

## Bug 2 — server silently ignores spectator game:action instead of rejecting

Spec: `tests/e2e/specs/rooms/spectate.spec.ts` line 66 — `test.fixme('spectator socket emit of a game action is rejected server-side — BLOCKED: server accepts spectator game:action', ...)`

File: `packages/server/src/socket/handlers.ts` — `socket.on('game:action', ...)` handler (~line 173)

Current behavior:
```ts
socket.on('game:action', (action, seq) => {
  const room = roomManager.findRoomByUser(userId);
  if (!room) return;        // ← silently drops spectator emits
  room.handleAction(userId, action, seq);
});
```

The spec connects a bot socket as spectator (via `room:spectate`), then emits `game:action`, and expects a `game:reject` within 3 s. The `return` on no room silently drops the emit → spec times out falsely passing (but the assertion is inverted so it fails when treated as "user expected rejection").

Fix: emit `game:reject` explicitly when the socket has no player-room OR is spectating. The emit should go back to the sender socket, not broadcast.

```ts
socket.on('game:action', (action, seq) => {
  const room = roomManager.findRoomByUser(userId);
  if (!room) {
    socket.emit('game:reject', 'Not a player in any active room');
    return;
  }
  room.handleAction(userId, action, seq);
});
```

**Note**: don't add a separate `spectatingRoomId` check — the above is sufficient because a user who is ONLY a spectator has no player-room, so `findRoomByUser` returns undefined. A user who is BOTH player in room X and spectator in room Y emitting `game:action` correctly targets room X (their player room) via `findRoomByUser`, which is existing (correct) behavior.

Verify this assumption: read `packages/server/src/engine/RoomManager.ts` `findRoomByUser` to confirm it only matches player-rooms, not spectator-rooms. If you find it also matches spectator rooms (unlikely), escalate in ISSUE doc instead of guessing.

## Task 3 — unfixme the 2 specs + unfixme the stale leaderboard fixme

After fixing Bug 1 and Bug 2:

1. **Unfixme `create-and-join.spec.ts` line 56**: change `test.fixme(...)` → `test(...)`. Keep the test body unchanged.

2. **Unfixme `spectate.spec.ts` line 66**: same.

3. **Unfixme `leaderboard/period-switching.spec.ts`**: there's a `test.fixme` with comment "BUG: POST /api/auth/sign-up/email returns HTTP 500". That bug was fixed in Stage 1.5 (BetterAuth + Postgres migration) — the fixme is now stale. Grep:
   ```bash
   rg "test\.fixme.*sign-up/email returns HTTP 500" tests/e2e/specs/leaderboard/
   ```
   Change `test.fixme(title, comment, async ...)` → `test(title, async ...)` and drop the BUG comment. Or if the test signature is `test.fixme('name', async ({page}) => {...})`, the comment lives as a JS comment before — delete the comment and change `test.fixme` → `test`.

## TableCraft iron rules (ALL apply)

1. **i18n**: No new user-visible strings needed. If you emit a new server-side error message, it's OK to be English literal (e.g. `'Room is full'`) — existing pattern per `GameRoom.join`. These error strings are sent as Ack payloads, not rendered directly.

2. **Typecheck is truth**: `pnpm typecheck` end-to-end. Ignore patch tool's isolated-file errors.

3. **Unit tests for server changes**: add to `packages/server/src/engine/GameRoom.test.ts` for Bug 1 (test a 3rd `join()` call on full room returns error). For Bug 2, add to `packages/server/src/socket/handlers.test.ts` OR skip if the handler test harness is heavyweight (e2e spec coverage is sufficient if so — document in ISSUE).

4. **Don't regress idempotency**: Bug 1 fix MUST keep the existing idempotent-rejoin behavior for existing members. Test both paths.

5. **Don't touch other workers' files**: scope below.

## Scope fence (editable paths)

- `packages/server/src/engine/GameRoom.ts` (Bug 1 fix)
- `packages/server/src/engine/GameRoom.test.ts` (Bug 1 unit test)
- `packages/server/src/socket/handlers.ts` (Bug 2 fix)
- `packages/server/src/socket/handlers.test.ts` (Bug 2 unit test if feasible)
- `tests/e2e/specs/rooms/create-and-join.spec.ts` (unfixme)
- `tests/e2e/specs/rooms/spectate.spec.ts` (unfixme)
- `tests/e2e/specs/leaderboard/period-switching.spec.ts` (unfixme stale)
- `docs/ISSUE_appfix_stage3.md` (new, your report)

**Do NOT touch** anything else. Especially not client code, fixtures, or room manager (the room manager's `findRoomByUser` is a read-only assumption).

## Validation (run these, paste output into ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test
# Unfixmed specs — kick the dev server first so server code changes apply:
# (I'll restart the server before e2e, don't do it yourself)
# After orchestrator restarts server, run:
pnpm exec playwright test tests/e2e/specs/rooms/ tests/e2e/specs/leaderboard/ --reporter=line
```

**IMPORTANT**: after editing server code, the running dev server has STALE code. Note this in your ISSUE doc and explicitly say "e2e validation pending orchestrator server restart". Don't try to kill the dev server yourself.

Actually — CORRECTION: you CAN run `pnpm exec tsx watch` is not the dev command; the dev server DOES auto-reload (nodemon/tsx watch). Check `packages/server/package.json` script. If `dev` uses `--watch`, your edits auto-reload and you can run e2e directly. If not, skip e2e validation and note in ISSUE.

## Deliverables

1. Root-cause fixes at declared paths
2. 2-3 new server unit tests (minimum for Bug 1)
3. 3 specs un-fixme'd
4. `pnpm typecheck` green
5. `pnpm --filter @repo/server test` green with new tests
6. Either e2e validation passed (if server auto-reloads) OR explicit "pending orchestrator server restart" in ISSUE
7. `docs/ISSUE_appfix_stage3.md` with sections:
   - Root cause per bug (1 paragraph each)
   - Files changed + why
   - Unit test output
   - e2e status (ran / pending)
   - `findRoomByUser` behavior confirmed (per Bug 2 assumption)
   - Any other bugs noticed but out of scope

START NOW.
