# ISSUE: Friends panel refresh bugs

Two e2e failures in `tests/e2e/specs/social/` traced to separate root causes — one server, one test.

## Bug 1 — unfriend does not remove the row (server)

### Root cause

`DELETE /api/friends/:userId` returned `res.status(204).end()` with an empty body.
The client's `apiFetch` (`packages/client/src/lib/api.ts`) unconditionally calls
`resp.json()` on every response to unwrap the `{ ok, data }` envelope — on an
empty 204 body that throws, and the wrapper rethrows as `ApiError('NETWORK_ERROR')`.
`removeFriend` in `useFriends.ts` awaits `apiFetch(...)` first and only calls
`load()` after it resolves, so the rejected promise skipped the refresh. The
row was deleted on the server but the panel never re-fetched. All four sibling
endpoints (GET /friends, /request, /accept, /decline) already returned the JSON
envelope — DELETE was the outlier.

### Fix

Return the same `{ ok: true }` JSON envelope as the sibling endpoints. Use
`.returning()` on the delete to detect missing rows and surface a proper
`404 NOT_FOUND` JSON error for the "not a friend" negative case (per spec).

## Bug 2 — outgoing section "missing" after re-request (test)

### Root cause

Not an application bug. After Alice re-requests Bob, the DOM correctly renders
TWO elements with text `发出的请求` (outgoingHeader):

1. An italic `<span>` inside the search-result row, used as the `pending_out`
   relation tag (from `handleAdd` locally patching `searchResults`).
2. The `<div>` header of the outgoing `<section>`, driven by the refreshed
   `data.pending.outgoing` from `load()`.

The assertion `alicePanelR.locator('text=发出的请求').toBeVisible()` hit
Playwright strict-mode and failed, while the earlier sibling assertion on the
same page had used `.first()` and silently matched only the span. Verified
manually via the failing trace: the section div was present each time. No
server-side or state bug.

### Fix

Tighten the assertion to target the `<section>` that contains both the
outgoing header AND `bob.name` — this proves the section actually re-rendered
(the span lives in a search-result row, not in a `<section>`). Strict-mode
compliant. Scope permits "minor timing / selector tweaks".

## Files changed

| File | Why |
|------|-----|
| `packages/server/src/api/friends.ts` | DELETE now returns `{ ok: true }` on success and `{ ok: false, error: { code: 'NOT_FOUND' } }` with 404 when the pair has no row. Uses `.returning()` to detect the miss. |
| `packages/server/src/api/friends.test.ts` | Updated the existing DELETE test to assert the new envelope (200 + `{ok:true}`) and 404 on re-delete. Added a regression test for DELETE on a pending outgoing request (cancel path). Added a Bug 2 regression covering decline → re-request → GET /friends surfaces Bob under `pending.outgoing`. |
| `tests/e2e/specs/social/friend-request-rejection.spec.ts` | Tightened the post-re-request outgoing-section assertion to filter on a `<section>` containing both the header text and `bob.name`, so search-result tag spans no longer match. |

No client changes required — the server envelope fix unblocks `useFriends.load()`.

## Validation

### `pnpm typecheck`

```
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/boardgames
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
```
Clean, no diagnostics.

### `pnpm --filter @repo/server test`

```
 ✓ |server| src/api/friends.test.ts  (16 tests) 16886ms

 Test Files  13 passed (13)
      Tests  104 passed (104)
   Duration  18.79s
```
16 friends tests — 14 pre-existing, 2 new (`DELETE also cancels a pending outgoing request`, `after decline, re-request from same sender inserts a fresh pending row`).

### `pnpm test` (full monorepo)

```
 Test Files  32 passed (32)
      Tests  484 passed (484)
   Duration  17.58s
```
The 13 trailing `Unhandled Error` lines are pre-existing jsdom/`html-encoding-sniffer` teardown noise — per project convention, `Tests N passed` is truth.

### `pnpm exec playwright test tests/e2e/specs/social/ --reporter=line`

```
Running 6 tests using 1 worker
[1/6] ... › friend-request-flow.spec.ts:18:3 ... Alice unfriends
[2/6] ... › friend-request-flow.spec.ts:116:3 ... guest user sees sign-in CTA
[3/6] ... › friend-request-flow.spec.ts:135:3 ... unauthenticated POST ... 401
[4/6] ... › friend-request-rejection.spec.ts:18:3 ... Alice can re-send
[5/6] ... › friend-request-rejection.spec.ts:118:3 ... friends API (401)
[6/6] ... › friend-request-rejection.spec.ts:140:3 ... no block-feature UI
  6 passed (9.9s)
```

## Negative scenarios verified (per spec)

All still hold after the fix — they are exercised by the server unit tests:

- [x] Unfriending user who is not a friend → 404 JSON (`DELETE removes accepted friendship and returns JSON envelope` — second delete case)
- [x] Declining a request that doesn't exist → 404 (`decline removes pending incoming and returns 404 if no such request`)
- [x] Re-requesting an already-accepted friendship → 409 `ALREADY_FRIENDS` (`request to already-accepted friend returns 409`)
- [x] Re-requesting while own request is pending-outgoing → 200 idempotent (`duplicate friend request returns 200 (idempotent)`)

## Other bugs noticed (out of scope)

- `apiFetch` in `packages/client/src/lib/api.ts` is brittle — it throws on any
  non-JSON success response (e.g. a legitimate 204 No Content). Other
  endpoints happen to all return JSON today, but the wrapper would benefit
  from handling `resp.status === 204 || content-length === 0` explicitly. Not
  fixed here because the server-side symmetry fix is sufficient for this task
  and changing `apiFetch` is a broader change.
- The "pending_out" marker inside search results reuses the same i18n string
  as the outgoing-section header (`lobbyPanel.friends.outgoingHeader`). Two
  visually distinct uses of the same text is a mild UX smell and the thing
  that broke the original test selector. A dedicated `relationPendingOut`
  key would read better and keep selectors stable. Did not change — touches
  both locale files plus product copy, outside this task's scope.
- `useFriends.load()` has a stale-data race: if multiple mutations fire
  concurrently (e.g. cancelling an outgoing request while the 30s poll fires),
  the later `load()` may resolve first and be overwritten by an older one.
  Not observed in the failing specs; flagging only.
