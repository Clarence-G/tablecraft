# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped bug-fix task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# App-fix worker: Friends panel refresh bugs

You are a bug-fix worker on TableCraft. Fix 2 real application bugs that the e2e suite surfaced. Both are in the friends panel UX.

## Repro baseline

Working dir: `/Users/bytedance/Projects/boardgames`

The Postgres `tablecraft_test` DB is already migrated. Dev server currently runs in-background on :3001 (rate limit 3000/min, already restarted). Do NOT kill or restart the dev server.

## Bug 1 — unfriend does not remove the row

Spec: `tests/e2e/specs/social/friend-request-flow.spec.ts`

Scenario: Alice is friends with Bob. Alice clicks Bob's "unfriend" control. Server returns 200. Alice's friends panel should remove Bob's row within 5 s. It does not.

Current behavior: DELETE `/api/friends/:userId` returns 200. `useFriends.removeFriend` awaits the request then `await load()`. Visually the row stays.

## Bug 2 — rejection leaves outgoing section missing after re-request

Spec: `tests/e2e/specs/social/friend-request-rejection.spec.ts`

Scenario: Alice requests Bob. Bob declines. Alice re-requests Bob. Alice's panel should show the "outgoing" section with Bob in it. It does not re-appear.

## TableCraft iron rules (ALL apply)

1. **i18n strict**: every user-visible string goes through `t(key)`. Zero hardcoded Chinese/English. **NEVER use `defaultValue` option** (even English fallbacks). Every new key goes in BOTH `packages/client/src/i18n/locales/{zh,en}/common.json`. If you only touch existing keys, no locale change needed.

2. **authClient path**: `@/lib/authClient` (not `auth-client`). Session shape is flat `{ session, user }`.

3. **Server is source of truth**: if the bug is server-side (wrong response, missing bidirectional delete), fix it server-side AND ensure unit test coverage. Client-side fixes alone are not acceptable.

4. **Typecheck is truth**: `pnpm typecheck` end-to-end. Ignore patch tool's isolated-file TS errors.

5. **Don't touch other workers' files**: scope below.

6. **pglite teardown noise in `pnpm test`**: ignore trailing ERROR lines; only the `Tests N passed` line is truth.

## Scope fence (editable paths)

- `packages/client/src/hooks/useFriends.ts`
- `packages/client/src/components/layout/LobbySidePanel.tsx`
- `packages/server/src/api/friends.ts` (if server-side bug)
- `packages/server/src/api/friends.test.ts` (new tests for server bugs)
- `tests/e2e/specs/social/friend-request-flow.spec.ts` (minor timing / selector tweaks OK; no content changes that mask bugs)
- `tests/e2e/specs/social/friend-request-rejection.spec.ts` (same)
- `docs/ISSUE_appfix_friends.md` (new, your report)

**Do NOT touch**: anything under `packages/server/src/socket/**`, `packages/client/src/pages/Lobby.tsx`, `tests/e2e/fixtures/**`, `packages/server/src/index.ts`.

## Diagnosis process (do this IN ORDER)

1. Read `packages/client/src/hooks/useFriends.ts` (111 lines). The hook has `removeFriend` that awaits `load()`. So the hook should refresh state.
2. Read how `LobbySidePanel.tsx` consumes `useFriends`. Find the `FriendsTab` component (within that 953-line file). Check:
   - Does it call `useFriends()` or is the state passed down via a parent that holds it stable?
   - Is there a local `useState` shadowing `data.friends` that doesn't re-sync?
   - Is there a `key` / `useMemo` deps bug?
3. Read the server endpoints: `packages/server/src/api/friends.ts`. Verify:
   - DELETE `/api/friends/:userId` removes BOTH directions in `friendships` table (the check constraint requires ordered `user_lo, user_hi`; a single row represents the friendship).
   - Decline endpoint: does it delete the request row, or only mark it rejected? If marked-rejected, re-request must either clear the old row or upsert.
4. Run the failing specs in isolation:
   ```bash
   pnpm exec playwright test tests/e2e/specs/social/friend-request-flow.spec.ts --reporter=line
   pnpm exec playwright test tests/e2e/specs/social/friend-request-rejection.spec.ts --reporter=line
   ```
   Read the trace/screenshot output. Identify whether state is wrong in DB (server bug), wrong in API response (server bug), or wrong in UI render (client bug).
5. Fix root cause. Do NOT paper over with longer timeouts or optimistic UI that hides a server bug.

## Negative scenarios to verify still hold after your fix

- [ ] Unfriending user who is not a friend → 404 or 400, panel unchanged
- [ ] Declining a request that doesn't exist → 404
- [ ] Re-requesting an already-accepted friendship → blocked with appropriate status
- [ ] Re-requesting while own request is pending-outgoing → blocked or no-op (whichever matches existing spec)

## Validation (run these, copy output into ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test
pnpm --filter @repo/client test
pnpm exec playwright test tests/e2e/specs/social/ --reporter=line
```

All must be green. If any e2e in the social folder still flakes, run 3 times; only escalate if it fails 2/3.

## Deliverables

1. Root-cause fix at declared paths (client OR server OR both)
2. `pnpm typecheck` green
3. Social e2e specs all passing (6/6 expected in that folder)
4. Any new server-side unit tests if the fix was server-side
5. `docs/ISSUE_appfix_friends.md` with sections:
   - Root cause (1 paragraph per bug)
   - Files changed + why
   - Validation output (paste the terminal output)
   - Any other bugs noticed but out of scope

START NOW.
