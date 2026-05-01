SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers, no mock-up proposals.

# Stage 3-B — Friends System

## 1. Context (read before coding)

Project root: `/Users/bytedance/Projects/boardgames` — pnpm monorepo (React+TS+Vite client, Socket.IO+Drizzle+pglite server, better-auth for identity).

**Stage 1 already landed** the `friendships` table:
```
packages/server/src/db/schema.ts:266-285
  friendships: { userA (PK), userB (PK), requestedBy, status, createdAt, acceptedAt }
  CHECK (user_a < user_b)  -- lexicographic normalization
  indexes on user_a, user_b
```
The `userBlocks` table also exists (`blockerId`, `blockedId`) for the moderation feature.

The client has `LobbySidePanel` with tabs for 排行榜/个人/最近. No friends UI yet.

Your scope: **build the friends feature end-to-end** — REST API, client REST hooks, UI in LobbySidePanel as a new "好友" tab, user discovery (search by username), online-presence lookup.

Read these files first (important — don't guess):
- `packages/server/src/db/schema.ts:266-285` — friendships shape
- `packages/server/src/db/schema.ts:248-260` — userBlocks shape (respect blocks in all APIs below)
- `packages/server/src/db/schema.ts` — find the `users` table (or better-auth's user table — it's `user` singular)
- `packages/server/src/api/router.ts` — REST mount pattern, how auth is checked
- `packages/server/src/api/reports.ts` (Stage 2) — good reference for a similar REST resource
- `packages/server/src/lib/auth.ts` — how session is extracted from request
- `packages/client/src/components/layout/LobbySidePanel.tsx` — tab pattern (Trophy/User/History icons). You'll add a 4th tab.
- `packages/client/src/pages/Me.tsx` — how existing client REST calls authenticate
- `packages/client/src/lib/authClient.ts` — NOT `auth-client`; auth client path
- `packages/client/src/i18n/locales/zh/common.json` and `en/common.json` — i18n pattern, `lobbyPanel.*` namespace

## 2. Tasks (scope — do not expand)

### Task A — REST API (`packages/server/src/api/friends.ts` — new file)

Mount under `/api/friends` via `registerFriendsRoutes(router)` called from `packages/server/src/api/router.ts`. All endpoints require authenticated user; return `401` otherwise. Respect block relationships — blocked users are invisible in search; existing friendship rows with a blocker/blocked pair must not accept new requests.

Endpoints:

1. `GET /api/friends` — list current user's accepted friends. Return `{ friends: [{ userId, name, status: 'online'|'offline', currentRoomId?: string }], pending: { incoming: [...], outgoing: [...] } }`. 
   - `status` = check `roomManager.findRoomByPlayer(userId)` → if result exists AND `player.connected` is true, status='online'; else 'offline'. If 'online' and seated in a room, include `currentRoomId`.
   - Need RoomManager access — inject via `registerFriendsRoutes(router, roomManager)`.

2. `GET /api/friends/search?q=<name>` — case-insensitive prefix search on username, limit 20. Excludes self, excludes already-accepted friends, excludes anyone the current user blocks OR is blocked by. Return `{ users: [{ userId, name, relation: 'none'|'pending_out'|'pending_in' }] }`.

3. `POST /api/friends/request` — body `{ targetUserId }`. Normalize `(userA, userB)` = sorted pair. If row doesn't exist → insert with `status='pending', requestedBy=<current user>`. If row exists with `status='accepted'` → 409. If row exists with `status='pending'` and the other party requested → auto-accept (set `status='accepted', acceptedAt=NOW()`). Idempotent duplicate requests return 200. Reject if block relationship exists.

4. `POST /api/friends/accept` — body `{ userId }` (the requester). Find pending row where `requestedBy = userId` and the current user is the other party → set `status='accepted', acceptedAt=NOW()`. 404 if no such pending request.

5. `POST /api/friends/decline` — body `{ userId }`. Delete the pending row (current user is the non-requester). 404 if no such pending.

6. `DELETE /api/friends/:userId` — remove an accepted friendship (either direction). 204 on success.

Use Drizzle ORM and PG's `and`, `or`, `eq`, `ilike` — mirror the patterns in `points.ts` / `reports.ts`.

**Server tests** (`packages/server/src/api/friends.test.ts` — new file): follow `reports.test.ts` structure (in-memory pglite, seed users, assert responses). Cover:
- unauthenticated → 401 for all endpoints
- request flow: request → list shows pending → accept → list shows accepted
- duplicate request is idempotent
- auto-accept when both parties request each other
- block relationship blocks request + hides in search
- search excludes self + accepted friends + blocked pairs
- remove (DELETE) works bidirectionally

At least **10 assertions**.

### Task B — Client UI

1. **New tab in LobbySidePanel** (`packages/client/src/components/layout/LobbySidePanel.tsx`):
   - Add 4th tab at position 2 (between Trophy and User): `Users` icon from lucide-react, key `'friends'`.
   - Extract `FriendsTab` into its own subcomponent inside the same file (consistent with LeaderboardTab / ProfileTab patterns).
   - Collapsed rail must also have the Users icon button.

2. **FriendsTab content** (inside `LobbySidePanel.tsx`):
   - Top: search input (placeholder from i18n `lobbyPanel.friends.searchPlaceholder`). Debounced 300ms, calls `/api/friends/search?q=...`. Results list with "+" add button on each row. Empty state if q is empty: "搜索好友".
   - Middle: pending requests section, split into "收到的请求" (incoming — Accept/Decline buttons) and "发出的请求" (outgoing — small Cancel button, which calls DELETE).
   - Bottom: friends list. Each row: name, online dot (green=online, gray=offline), if online and in a room → "加入房间" button that routes to `/room/:currentRoomId`. Remove (trash) icon on hover.
   - Empty state for the friends list: a friendly empty-state illustration-free block with "还没有好友" + a single line of helper text. i18n keys: `lobbyPanel.friends.empty.title` + `.helper`.
   - Guest users see a "登录后查看好友" empty state (same pattern as the existing recent tab).

3. **i18n keys** (add to BOTH `zh/common.json` and `en/common.json`, under `lobbyPanel.friends.*`):
   ```
   tabLabel, searchPlaceholder,
   incomingHeader, outgoingHeader, friendsHeader,
   empty.title, empty.helper,
   guestEmpty,
   status.online, status.offline,
   actions.add, actions.accept, actions.decline, actions.cancel,
   actions.remove, actions.joinRoom,
   toast.requestSent, toast.accepted, toast.declined,
   toast.removed, toast.error
   ```
   You MUST add every key to both locale files. Mismatch breaks i18n tests.

4. **API client hook** (`packages/client/src/hooks/useFriends.ts` — new):
   - Export `useFriends()` — GET /api/friends on mount + after mutations, polling every 30s for online status changes.
   - Export mutation helpers: `sendRequest(userId)`, `acceptRequest(userId)`, `declineRequest(userId)`, `removeFriend(userId)`, `searchUsers(q)`.
   - Use `fetch` with `credentials: 'include'` for cookie auth (same pattern as existing hooks — grep `useRecentGames.ts` / `Me.tsx`).

**Client tests** — optional but welcome. Focus server tests first. If time: `useFriends.test.tsx` with MSW or simple fetch-mock covering the list+request flow.

## 3. Project hard constraints

- **ALL user-facing strings MUST go through i18n.** Zero hardcoded Chinese/English in rendered text. Add keys to BOTH locale files. Never use `t(key, { defaultValue: '中文兜底' })`.
- Use existing Tailwind classes from LobbySidePanel for consistency — don't invent new color tokens.
- No new runtime dependencies. `lucide-react` is already installed; use its icons (Users, UserPlus, UserMinus, Check, X, Search).
- TS strict. `unknown` over `any`.
- Don't modify the `friendships` table schema; Stage 1 locked the shape (`userA < userB` check constraint). Always normalize pairs at insert time: `const [a, b] = [u1, u2].sort()`.
- Don't run `pnpm dev`. Don't push. Don't commit.

## 4. Verification

Run from project root:
1. `pnpm --filter @repo/server build` → expect green
2. `pnpm typecheck` → expect green
3. `pnpm test` → expect all pre-existing tests green + your new `friends.test.ts` (≥10 assertions). Report final `Tests  X passed (X)` count.
4. Grep: `rg -n '[\u4e00-\u9fff]+' packages/server/src/api/friends.ts packages/client/src/hooks/useFriends.ts` — should return zero matches. `rg -n '[\u4e00-\u9fff]+' packages/client/src/components/layout/LobbySidePanel.tsx` — no NEW Chinese (pre-existing is fine; list your diff-added lines are clean).
5. i18n parity check: every key you added to `zh/common.json` must exist in `en/common.json` and vice versa. Eyeball the diff or run `node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json');const e=require('./packages/client/src/i18n/locales/en/common.json');const flatten=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flatten(v,p+k+'.'):[p+k]);const zk=new Set(flatten(z));const ek=new Set(flatten(e));console.log('only zh:',[...zk].filter(k=>!ek.has(k)));console.log('only en:',[...ek].filter(k=>!zk.has(k)))"` — both arrays should be empty.

## 5. Deliverable — ISSUE doc

Write `docs/ISSUE_stage3-friends.md` with 6 sections:
1. **Summary**
2. **Changes** — every file touched
3. **Tests** — test files + assertion counts, final total
4. **Out of scope** — what you deferred
5. **Manual e2e** — how to demo: login two users, userA searches userB, sends request, userB accepts, both see each other in friends list. Cover the block path too.
6. **Friction notes** — ambiguities, pitfalls, prompt gaps

## 6. Execution order suggestion

1. Read ALL files in §1 first
2. Build `POST /api/friends/request` + `GET /api/friends` first — smallest useful slice
3. Add friends.test.ts with just those 2 endpoints → green
4. Fill in remaining endpoints + tests incrementally (accept, decline, search, delete)
5. Build UI: FriendsTab (list only) → add search → add pending sections
6. i18n parity check
7. Full verification
8. ISSUE doc
9. STOP. Do not commit.

Begin now.
