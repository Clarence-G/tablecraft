# Code Quality + Architecture Audit — TableCraft

Scope: read-only audit of `packages/{client,server,shared,game-ui,cli}` covering
type escape hatches, dead code, god components, duplicate logic, hook
foot-guns, TODOs, test coverage gaps, naming inconsistency, import hygiene,
console noise in production, Drizzle hygiene, and the socket event surface.

Audit date: 2026-05-01. 7 unpushed commits on main. 544/544 unit+integration
tests green.

---

## Severity Summary

| Severity | Count | Description |
|---|---|---|
| **P0** (bug / correctness)      | **0** |   |
| **P1** (smell that slows future work) | **7** | god components, duplicated fetch pattern, engine emit escape hatch, deep relative imports, test coverage gaps, naming drift, missing hook cleanup |
| **P2** (nice-to-fix)            | **6** | dead exports in game-ui, orphan boards, `any` in CLI, side-effect module singleton, console noise, schema FK gaps |
| **P3** (nit)                    | **4** | minor typing, comment placement, cosmetic naming |
| **Total**                       | **17** |   |

**Top 5 findings (one-liners):**

1. **P1** `packages/server/src/socket/handlers.ts:298-318` — `emitToPlayer`/`emitSpectators` take `event: string` + `(s as any).emit(event, data)` — erases the `ServerEvents` typing that the rest of the codebase enforces.
2. **P1** `packages/client/src/components/layout/LobbySidePanel.tsx` (953 LOC) — god component hosting 5 tabs (Leaderboard/Profile/Friends/Recent/rail) with 4 `useEffect`s and inline fetch logic; blocks maintainability of any lobby feature.
3. **P1** `AbortController + apiFetch + setLoading(true) + .then/.catch/.finally + controller.abort()` pattern is copy-pasted in ≥10 places (usePoints, useRecentGames, useFriends, Leaderboard, GamesAll, Me, Lobby×2, LobbySidePanel×2).
4. **P1** 7 client pages import the games registry via `../../../../games/client-registry` (4 levels) — bypass of the `@games/*` alias convention and fragile to move.
5. **P1** Critical client modules (`useSocket`, `useGame`, `useRoom`, `useChat`, `api.ts`, `App.tsx`) have **zero** unit tests; only 2/41 client source files under `packages/client/src` have a sibling `.test.*`.

Full doc below. Run `pnpm test` after any refactor listed here.

---

## P0 — Correctness bugs

_None found in this pass._

---

## P1 — Smells that slow future work

### P1-1 Socket emit type-safety hole in server engine glue

- **File**: `packages/server/src/socket/handlers.ts:296-319`
- **Evidence**:
  ```ts
  room.emitToPlayer = (playerID: string, event: string, data?: unknown) => {
    ...
    (s as any).emit(event, data);           // <- line 305
  };
  room.emitSpectators = (event: string, data: unknown) => {
    ...
    (s as any).emit(event, data);           // <- line 316
  };
  ```
  The rest of the code enforces `Server<ClientEvents, ServerEvents>` + `Socket<ClientEvents, ServerEvents>` end-to-end (see `shared/src/types/socket.ts`, `useSocket`, `useGame`, `useRoom`, `useChat`, `index.ts`). These two helpers — called from `GameRoom.ts:238,242,245,503,508,517,560,605` — accept arbitrary `event: string` and bypass the typed emit. Net effect: typos like `emitToPlayer(pid, 'game:notifyy', …)` compile.
- **Refactor**: Narrow the parameter:
  ```ts
  emitToPlayer<E extends keyof ServerEvents>(
    playerID: string, event: E, ...args: Parameters<ServerEvents[E]>
  ): void
  ```
  Same for `emitSpectators`. Then drop the two `as any` casts; `s.emit(event, ...args)` type-checks cleanly.

### P1-2 LobbySidePanel god component (953 LOC)

- **File**: `packages/client/src/components/layout/LobbySidePanel.tsx`
- **Evidence**: single file exports one `LobbySidePanel`, but internally renders 5 sub-UIs (rail, leaderboard tab, profile tab, friends tab with search/pending/list, recent tab) plus debounced search + toast notice. 4 `useEffect`s (lines 154, 253, 391, 837); 5 distinct `useState` clusters. No sub-files, so jumping to "the friends tab" means scrolling. `setTimeout(() => setNotice(''), 3000)` at line 410 has **no cleanup** — if the component unmounts during the 3s window, React logs a warning and the closure retains `setNotice`.
- **Refactor**: split into `LobbySidePanel/index.tsx` (shell) + `LeaderboardTab.tsx`, `ProfileTab.tsx`, `FriendsTab.tsx`, `RecentTab.tsx`. Extract the debounced search into a `useDebouncedQuery` hook. Replace the bare `setTimeout` with a `useToast` hook that cleans up on unmount.

### P1-3 Copy-pasted fetch+loading+abort pattern

- **Files (≥10 copies)**:
  - `packages/client/src/hooks/usePoints.ts:37-70`
  - `packages/client/src/hooks/useRecentGames.ts:31-52`
  - `packages/client/src/hooks/useFriends.ts:50` (useEffect body)
  - `packages/client/src/pages/Leaderboard.tsx:41-66`
  - `packages/client/src/pages/GamesAll.tsx:28-48`
  - `packages/client/src/pages/Lobby.tsx:83-101`, `103-115`
  - `packages/client/src/pages/Me.tsx:31-…`
  - `packages/client/src/components/layout/LobbySidePanel.tsx:154-171`, `253-…`
- **Evidence**: every copy repeats
  ```ts
  const controller = new AbortController();
  setLoading(true);
  apiFetch<T>(url, { signal: controller.signal })
    .then(...)
    .catch(() => { if (!controller.signal.aborted) ... })
    .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
  ```
  ~20 LOC × ~10 sites = ~200 LOC of identical choreography. Bugs (or fixes) must be applied everywhere.
- **Refactor**: add a thin `useFetch<T>(url, deps, opts?)` hook in `packages/client/src/hooks/useFetch.ts` that returns `{ data, isPending, error, refetch }` and internally owns the `AbortController`. Migrate hooks first (`usePoints`, `useRecentGames`); pages can follow. This is *not* a push to TanStack Query — just deduplicate within the existing pattern.

### P1-4 Deep relative imports into `games/`

- **File:line pattern**: `../../../../games/client-registry`
- **Sites (7)**:
  `packages/client/src/pages/RoomsAll.tsx:7`, `SpectatorView.tsx:7`, `GamesAll.tsx:6`, `Me.tsx:6`, `Lobby.tsx:12`, `Leaderboard.tsx:6`, `Game.tsx:5`, `lib/tags.ts:2`; also `packages/client/src/i18n/index.ts:13` for `import.meta.glob`.
- **Evidence**: `CLAUDE.md` §7 references `@games/*` as the package alias convention, and games are registered as workspace deps by `pnpm gen:registry`. Yet client pages reach into `../../../../games/` directly. Any future relocation of `packages/client` breaks 8 files at once.
- **Refactor**: add a TS path alias `@games/registry` → `games/client-registry.ts` in `tsconfig.base.json` + matching Vite resolve alias in `packages/client/vite.config.ts`. Replace the 8 call-sites. (Server already uses `../../../games/server-registry.js` once — consider the same treatment.)

### P1-5 Zero unit tests for critical client infrastructure

- **Evidence**: 41 non-test files under `packages/client/src`; only 2 have sibling `.test.*` files. Specifically missing tests for:
  - `hooks/useSocket.ts` — module-level singleton, auth-identity reconnect logic
  - `hooks/useGame.ts` — `GameStore` class with seq tracking, `SEND_TIMEOUT_MS`, timer cleanup
  - `hooks/useRoom.ts`, `hooks/useChat.ts` — socket listener lifecycles
  - `lib/api.ts` — guest-claim flow with retry semantics (see P2-3)
  - `App.tsx` — the URL↔room-state sync effect with spectator exclusion (comment at line 80 shows it's subtle)
- **Counter-point**: E2E (playwright) covers the happy paths, and `packages/server` has 13 test files covering handlers, engine, API. But regressions in client hooks won't trip until e2e runs.
- **Refactor**: add at minimum `useGame.test.ts` (GameStore seq + timer behavior) and `useSocket.test.ts` (identity-swap reconnect). These are the two with non-trivial logic.

### P1-6 Naming drift: `playerID` vs `userId` vs `playerId`

- **Evidence**: three distinct casings for the same concept:
  - `playerID` (50 occurrences) — used in shared engine contract (`types/engine.ts:83-89`, `game-harness.ts`), all game `logic.ts` files, `GameRoom.ts:171,238,298`
  - `userId` (server-only) — in `schema.ts`, `handlers.ts:263,288`, BetterAuth tables, `socket.data.userId`
  - `playerId` (camelCase) — `ClientEvents` at `socket.ts:31` (`'room:kick': (playerId: string) ...`)
  - Plus `from: string // userId` (socket.ts:9) — `ChatMessage.from` silently holds a userId
- **Fallout**: `handlers.ts:303` says `s.data.userId === playerID` — reader must recognize these two names point at the same string. Friends/block/report code uses `userId`; game-logic code uses `playerID`. New contributors hit this on day 1.
- **Refactor**: pick one (`userId` recommended — it's the DB-level identity). The `playerID` spelling is baked into the `GameLogic` contract (`types/engine.ts`), so migration has blast radius; at minimum add a top-of-file doc in `types/engine.ts` saying "`playerID` ≡ `user.id`" and rename `ClientEvents['room:kick']` parameter from `playerId` → `userId` to match the rest of the transport layer.

### P1-7 Missing cleanup in `LobbySidePanel` notice toast

- **File**: `packages/client/src/components/layout/LobbySidePanel.tsx:410`
- **Evidence**: `setTimeout(() => setNotice(''), 3000);` with no handle saved, no cleanup. Dismounting the panel mid-timeout fires `setNotice` on an unmounted subtree (React 18 tolerates it but it's a warning in dev + still a closure leak).
- **Refactor**: store the id, clear on effect cleanup or on the next notice:
  ```ts
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  ...
  if (toastTimer.current) clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => setNotice(''), 3000);
  // and: useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  ```
  Or move to a shared `useToast` hook (see P1-2).

---

## P2 — Nice to fix

### P2-1 Orphaned game-ui exports

- **Files**:
  - `packages/game-ui/src/board/GridBoard.tsx` — 0 consumers outside package
  - `packages/game-ui/src/board/GridCell.tsx` — 0 consumers outside package (and `GridBoard` doesn't use it either)
  - `packages/game-ui/src/resume/ResumeCard.tsx` — 0 consumers (re-exported from `game-ui/index.ts`)
  - `packages/game-ui/src/points/PointsBadge.tsx` — 0 consumers
- **Evidence**: grep of `GridBoard|GridCell|ResumeCard|PointsBadge` across `packages/`, `games/`, `tests/` returns 0 hits outside each component's own directory. Contrast: `GameOverModal` (8), `PlayerBadge` (7), `PlayingCard` (14), `HandStrip` (3) — all live.
- **Refactor**: either (a) delete the four orphans and drop their index re-exports, or (b) if they're staged for upcoming work, add a one-line `// TODO(stage N): used by <game>` so the orphan status is intentional. I recommend deletion — the `HandStrip` + `IntersectionBoard` + `DiscBoard` + `GameTable` set already covers current grid games and unused code rots fast.

### P2-2 `as any` in CLI for JSON-API shape narrowing

- **File:lines**: `packages/cli/src/index.ts:152,154`; `packages/cli/src/commands/game.ts:82`; `packages/cli/src/commands/login.ts:27,36`
- **Evidence**:
  ```ts
  const result = (await client.get('/bot/whoami')) as any;
  ```
  The REST API already returns typed shapes in `packages/server/src/api/*`; the CLI opts out.
- **Refactor**: define lightweight response types in `packages/cli/src/types.ts` (or re-export from server if practical) and use `client.get<WhoamiResponse>(...)`. Low priority — CLI is thin.

### P2-3 Auth-side-effect `as any` in test files

- **Files**: `packages/server/src/socket/auth.test.ts:47`; `packages/server/src/api/reports.test.ts:50`; `packages/server/src/api/friends.test.ts:55`; `packages/server/src/api/points.test.ts:59`
- **Evidence**: `setupAuth(io, auth as any)` — test scaffolding bypasses the `Auth` type because tests stub BetterAuth.
- **Refactor**: add a `TestAuth = Partial<Auth>` type export or a real stub factory in `packages/server/src/db/testing.ts`. Nit-level but removes 4 `any`s.

### P2-4 Module-level socket singleton in `useSocket`

- **File**: `packages/client/src/hooks/useSocket.ts:13`
- **Evidence**: `let socketInstance: AppSocket | null = null;` — file-scope mutable singleton. Works because the app mounts exactly one `<App>` under one React root, but:
  - HMR under Vite re-imports the module; the singleton survives, producing "two React trees share one socket" artifacts.
  - Any future test that renders `App` into JSDOM will poison the next test (no reset path).
- **Refactor**: move the singleton into a React Context provider at the App root, or into a small `globalThis.__TABLECRAFT_SOCKET` keyed ref that HMR can clear via `import.meta.hot.dispose`. Not urgent — just flag for the next React 19 / Suspense refactor.

### P2-5 `console.*` in production client paths

- **File:lines**:
  - `packages/client/src/lib/api.ts:66,73,76` — guest-claim info + warn
  - `packages/client/src/lib/analytics.ts:9,25` — log when key missing, warn on track failure
  - `packages/client/src/lib/sentry.ts:6` — log when DSN missing
- **Evidence**: none of these are guarded by `import.meta.env.DEV`. In a prod build they'll surface on every user's devtools (benign but noisy and leaks internals).
- **Refactor**: guard with `if (import.meta.env.DEV) console.info(...)` or route through `shared/src/logging/log.ts`. `console.warn/error` for actual failures (`api.ts:76`, `analytics.ts:25`) are OK to keep — those are signal, not noise.

### P2-6 Schema — FK gaps on `room_players.user_id`, `action_log.user_id`, `chat_messages.user_id`, `reports.*_id`

- **File**: `packages/server/src/db/schema.ts:130,146,211,229,230,251,252,269,270`
- **Evidence**: `roomPlayers.userId`, `actionLog.userId`, `chatMessages.userId`, `reports.reporterId`, `reports.targetUserId`, `userBlocks.blockerId`/`blockedId`, `friendships.userA`/`userB` all declared as `text('...').notNull()` with **no `.references(() => user.id)`**. Comment at line 23 acknowledges "`users` (plural) table above, which is still referenced by `room_players.user_id`" — but the reference is only semantic, not enforced. `points_ledger.userId` DOES use `.references(() => user.id, { onDelete: 'set null' })` (line 183) — proving the team knows how. The rest are inconsistent.
- **Refactor**: add explicit FKs where the target is stable (`reports`, `chat_messages` → `user.id`). For `room_players.user_id` a FK to the legacy plural `users` table may be intentional (guests use that); document it. Indexes: `room_players` has no secondary index on `user_id` alone, only the composite PK — queries like `findRoomByUser(userId)` scan unless covered by the PK ordering.

---

## P3 — Nits

### P3-1 Comment embedded in JSX textually reads as `as any`

- **File**: `packages/game-ui/src/scene/textures/FeltTexture.tsx:44`
- **Evidence**: the string `as any pattern` appears inside a prose comment (`"...like a as any pattern. No axial stretch..."`). It's a false positive in the `as any` regex but worth rewording (`"arbitrary pattern"`) so the codebase-wide grep stays clean.
- **Refactor**: reword.

### P3-2 Inconsistent exports style in `game-ui`

- **Evidence**: most files use named exports (`export function Foo`). Two files mix:
  - `board/DiscBoard.tsx` exports both `DiscBoard` (the component) **and** string constants `PLAYER_DISC_COLORS`, `PLAYER_DISC_BG`, `PLAYER_DISC_BG_GHOST` from the same file — a component file exporting theme tokens.
- **Refactor**: move the three `PLAYER_DISC_*` constants to `game-ui/src/board/colors.ts` or `packages/client/src/lib/colors.ts` so the visual-theme surface is distinct from the component file.

### P3-3 `ChatMessage.from` typed as bare string

- **File**: `packages/shared/src/types/socket.ts:9`
- **Evidence**:
  ```ts
  export interface ChatMessage {
    id: string;
    from: string; // userId
    fromName: string;
    ...
  ```
  Comment doc'd, not enforced. Low cost.
- **Refactor**: introduce a `type UserId = string & { readonly __brand: 'UserId' }` if desired; otherwise rename `from` → `fromUserId` at the source to self-document.

### P3-4 `debugger;` / `XXX` / `HACK` / `FIXME` / `TODO`

- **Evidence**: grep of `TODO|FIXME|XXX|HACK` across `packages/**/*.{ts,tsx}` returns **zero** matches; no `debugger;`. Impressively clean. Keep it that way — if a temporary skip is needed, prefer `it.todo(...)` or `// NOTE(issue-123):` with a tracking link.

---

## Notes on dimensions that came up clean

- **Typed socket event surface**: `ClientEvents` / `ServerEvents` (`shared/src/types/socket.ts`) are applied to `Server<...>` and `Socket<...>` at every io instantiation (`packages/server/src/index.ts:46`, `socket/auth.ts:35`, `socket/handlers.ts:12-13`, `hooks/useSocket.ts:5`, `hooks/useGame.ts:5`, `hooks/useRoom.ts:5`, `hooks/useChat.ts:5`). No `socket.emit('string-literal', anyObj)` with a non-typed socket. P1-1 is the single hole — and it's confined to two engine-glue functions that lie just outside the typed emit.
- **Drizzle indexes where expected**: `rooms.status`, `action_log.(room_id,user_id,seq)`, `points_ledger.(user_id,created_at)`, `chat_messages.(room_id,created_at)`, `reports.status_created`, `friendships.user_a`/`user_b`. Only `room_players` stands out (P2-6).
- **Hook cleanups**: socket listener effects (`useRoom`, `useChat`, `useSocket`, `App.tsx:53`, `RoomsAll.tsx:55`, `Lobby.tsx:116`, `SpectatorView.tsx:34`) all pair `socket.on(...)` with `return () => socket.off(...)`. `setInterval` in `GameRoomLayout.tsx:41` and `RoomsAll.tsx:45` clean up. `useGame.ts` has `rejectTimer`/`sendTimer` cleanup in `destroy()` and an explicit biome-ignore for the intentional stale-ref pattern with `storeRef`. The only miss is P1-7.
- **Dead code**: no orphan files under `packages/client/src` or `packages/server/src`. Orphans are localized to four `packages/game-ui/*` exports (P2-1).
- **`@ts-ignore` / `@ts-expect-error`**: zero occurrences across `packages/`.
- **Circular imports**: none detected by spot-check (client `hooks/*` → `lib/*` → `shared`; server `socket/*` → `engine/*` → `shared`; no back-edges).
- **TODO/FIXME**: zero (see P3-4).

---

## Suggested ordering for refactor work

1. **P1-3** (duplicate fetch pattern) — highest ROI, enables other refactors to be shorter.
2. **P1-1** (socket emit typing) — 15-minute fix, closes the one remaining type hole.
3. **P1-4** (deep relative imports) — single Vite + tsconfig edit, 8 grep-and-replace sites.
4. **P1-2** (LobbySidePanel split) — mid-effort but frees future lobby work.
5. **P1-5** (client hook tests) — write `useGame.test.ts` + `useSocket.test.ts` first.
6. **P1-6** (`playerID` vs `userId`) — rename `ClientEvents['room:kick']` arg only; full rename is not worth the blast radius.
7. **P1-7, P2-1, P2-2, P2-3, P2-5** — easy small PRs, ship in one cleanup sweep.
8. **P2-4, P2-6, P3-*** — defer until adjacent work lands on these files.
