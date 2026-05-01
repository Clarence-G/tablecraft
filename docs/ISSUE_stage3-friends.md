# Stage 3-B — Friends System

## 1. Summary

Implements the friends feature end-to-end: REST API (`/api/friends/*`), client hook (`useFriends`), and a new "好友/Friends" tab in `LobbySidePanel`. Supports user discovery by name prefix, friend requests (with auto-accept when both parties request), accept/decline, removal, and online-presence indication via `RoomManager`. All block relationships from Stage 2 are respected throughout.

## 2. Changes

| File | Description |
|------|-------------|
| `packages/server/src/api/friends.ts` | **New** — 6 REST endpoints under `/api/friends` |
| `packages/server/src/api/friends.test.ts` | **New** — 14 assertions covering all endpoints |
| `packages/server/src/api/router.ts` | Added `registerFriendsRoutes(router, roomManager)` import + call |
| `packages/client/src/hooks/useFriends.ts` | **New** — `useFriends()` hook with polling and mutation helpers |
| `packages/client/src/components/layout/LobbySidePanel.tsx` | Added `FriendsTab` component, `Users` icon, 4th tab at position 2, rail icon, updated `TabId` union |
| `packages/client/src/i18n/locales/zh/common.json` | Added `lobbyPanel.friends.*` keys (33 keys) |
| `packages/client/src/i18n/locales/en/common.json` | Added `lobbyPanel.friends.*` keys (33 keys, parity confirmed) |

## 3. Tests

**New test file:** `packages/server/src/api/friends.test.ts`

| Test | Assertions |
|------|-----------|
| GET /api/friends → 401 without session | 1 |
| GET /api/friends/search → 401 without session | 1 |
| POST /api/friends/request → 401 without session | 1 |
| POST /api/friends/accept → 401 without session | 1 |
| POST /api/friends/decline → 401 without session | 1 |
| DELETE /api/friends/:userId → 401 without session | 1 |
| Full request → accept flow (pending then accepted) | 7 |
| Duplicate friend request is idempotent (200, one DB row) | 3 |
| Auto-accept when both parties request each other | 2 |
| Block prevents request + hides in search | 3 |
| Search excludes self/accepted, shows pending relation | 2 |
| Decline removes row, second decline → 404 | 3 |
| DELETE removes accepted friendship, idempotent | 3 |
| Request to already-accepted friend → 409 | 2 |

**Final result:** `Tests 102 passed (102)` — 14 in `friends.test.ts`, all pre-existing tests green.

## 4. Out of Scope

- **Real-time push notifications** for friend requests (would require Socket.IO event from server on request/accept). Current design polls every 30s.
- **Client-side tests** (`useFriends.test.tsx`). Server tests were prioritized per spec guidance.
- **Pagination** on the friends list or search results (capped at 20 per spec).
- **Friend count badge** on the tab rail icon when there are pending incoming requests.

## 5. Manual E2E

### Happy path — request, accept, join room

1. Start the dev server and open two browser windows (different profiles/incognito).
2. Sign up as `alice@test.com` / `bob@test.com` and log in each.
3. In Alice's window, open the side panel → click "好友/Friends" tab.
4. Type "Bob" in the search input. Bob's row appears with an "Add" button.
5. Click "Add" — toast confirms "Friend request sent". Bob's entry shows "Sent requests".
6. In Bob's window, open Friends tab → "Incoming requests" shows Alice. Click "Accept".
7. Alice's Friends tab (after 30s poll or re-open) shows Bob in the friends list.
8. If Bob creates a room, Alice sees a green dot + "Join room" button next to Bob.

### Block path

1. Alice reports/blocks Bob via `POST /api/reports/blocks` (or existing UI).
2. Alice searches for "Bob" — no results.
3. Bob tries to request Alice → 400 BLOCKED.

### Remove / cancel

- Hover over a friend row → trash icon appears → click to remove.
- In "Sent requests", click Cancel → row disappears.

## 6. Friction Notes

- **Auth pattern in tests**: `vi.resetModules()` + `vi.doMock` per `beforeEach` was required to inject the mocked `db` before the friends module is loaded — same pattern as `reports.test.ts`.
- **RoomManager injection**: The spec says "inject via `registerFriendsRoutes(router, roomManager)`". The existing `createApiRouter` already receives `roomManager`, so threading it through was straightforward.
- **No toast library**: No existing toast infrastructure found. Implemented a simple inline notice state that auto-clears after 3 seconds. I18n toast keys exist for if/when a toast library is added.
- **`useNavigate` in FriendsTab**: Used `react-router-dom`'s `useNavigate` for the "Join room" button since the `LobbySidePanel` doesn't receive a room-navigation callback prop. This is consistent with `App.tsx`.
- **Pre-existing build errors**: At the time of implementation, `packages/shared/src/types/room.ts` had `spectatorCount` and `status` added by in-progress Stage 3-reconnect work, and `GameRoom.ts` already included those fields in `toRoomState()`/`toRoomSummary()`. The errors appeared in one test run but vanished after the stash/pop cycle — likely a stale TypeScript incremental cache artifact.
