# Stage 2 E2E — remaining fixme / failing tests

After Stage 1.5 (pglite→Postgres), Stage 2 salvage, and the auth-fixme
unblock (commit e57ca4a), the full e2e baseline is:

**45 / 48 passing** (in isolation; some flake when run all-in-one due to
ordering & toast timing).

## Remaining issues

### Real application bugs (not fixme, actual failures)

1. **friend-request-flow: Alice unfriends Bob, but Bob's row does not
   disappear from Alice's friends panel within 5 s.**
   - Repro: run `pnpm exec playwright test tests/e2e/specs/social/friend-request-flow.spec.ts`.
   - The DELETE request may succeed server-side but the panel does not
     re-fetch / filter locally after unfriend completes.
   - Likely fix: invalidate the friends query / optimistic remove in
     `LobbySidePanel` FriendsTab after `removeFriend`.

2. **friend-request-rejection: after Bob declines, Alice re-sends a request
   but "outgoingHeader" section does not re-appear in her panel.**
   - Repro: run `pnpm exec playwright test tests/e2e/specs/social/friend-request-rejection.spec.ts`.
   - Same class of bug as #1: panel state doesn't refresh after social
     mutations.

### Real app bugs already known (fixme kept)

3. **rooms/create-and-join.spec.ts: third player can join a full 2-player
   gomoku room** (`BLOCKED: server allows join to full room`).
4. **rooms/spectate.spec.ts: server accepts `game:action` from a
   spectator** (`BLOCKED: server accepts spectator game:action`).
5. **leaderboard/period-switching: rare flake in authenticated period
   switching** (description tbd).

## Fixed in this pass

- 6× auth fixme → re-enabled, all pass
- 3× social fixme (mis-attributed to sign-up 500) → re-enabled
- BetterAuth 1.6 endpoint rename (`forget-password` → `request-password-reset`)
- BetterAuth reset URL path-vs-query migration (`?token=X` → `/reset-password/X`)
- Dev env API rate limit raised from 300 → 3000 req/min (prevents e2e
  self-throttling; production still 300)
- e2e fixtures: `server-log.ts` / `db-reset.ts` migrated off pglite dataDir
  plumbing to a postgres DATABASE_URL (shared `tablecraft_test`).

## Next steps

- Debug & fix the 2 friends-panel refresh bugs (needs React Query /
  `useFriends` hook inspection).
- Fix or remove room-full guard (`roomManager.join`) — Stage 3 scope.
- Fix spectator `game:action` reject path in socket handler — Stage 3 scope.
