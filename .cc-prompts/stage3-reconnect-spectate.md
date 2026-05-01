SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers, no mock-up proposals.

# Stage 3-A — Reconnect + Spectator Mode

## 1. Context (read before coding)

Project root: `/Users/bytedance/Projects/boardgames` — pnpm monorepo (React+TS+Vite client, Socket.IO+Drizzle+pglite server).

**Stage 2 already landed** (commit `1b1218e`):
- `GameRoom.persistState()` auto-saves `stateJson` on every state change
- `GameRoom.fromPersisted(row, state, logic, registry)` — static factory
- `RoomManager.hydrate(registry)` — boot-time restore from `games` table
- `markDisconnected(playerId)` / `markReconnected(playerId, socketId)` — flip `connected` flag + AFK bot timer

**What's STILL missing (your scope):**
1. **Reconnect flow** — when a socket reconnects (page refresh, network blip), it should rejoin the same room+seat and receive current `room:state` + `game:state`. Today: the socket drops, `markDisconnected` fires, and the user has no client-side path to resume.
2. **Spectator mode** — users who aren't seated at a room should be able to watch. Today: only seated players receive `game:state`; non-players get nothing. We need a `room:spectate` event + spectator-safe view (no private info leakage — poker hole cards, codenames spymaster grid, etc.).

Read these files first (important — don't guess):
- `packages/shared/src/types/socket.ts` — ClientEvents/ServerEvents (you'll add events here)
- `packages/shared/src/types/room.ts` — RoomState/RoomSummary shapes
- `packages/server/src/engine/GameRoom.ts` — especially `join`, `leave`, `markDisconnected`, `markReconnected`, `broadcastViews` (lines 260+)
- `packages/server/src/engine/RoomManager.ts` — `findRoomByPlayer`, room lifecycle
- `packages/server/src/socket/handlers.ts` — where all socket events dispatch
- `packages/server/src/socket/auth.ts` — how userId is attached to each socket
- `packages/client/src/lib/socketClient.ts` — client socket setup, auto-reconnect
- `packages/client/src/pages/GameRoom.tsx` — client side room mount, subscribes to `room:state` / `game:state`
- `packages/game-ui/src/GamePlayView.tsx` (or similar) — how views render
- `games/*/logic.ts` — note that each game's logic defines `view(state, playerId)` — you'll need a spectator-view variant

## 2. Tasks (scope — do not expand)

### Task A — Reconnect

**Server:**
1. In `packages/server/src/socket/handlers.ts`, when a socket (re)connects with `userId` (from auth middleware), check if `roomManager.findRoomByPlayer(userId)` returns a room. If yes, automatically:
   - Call `room.markReconnected(userId, socket.id)`
   - `socket.join(room.id)` (Socket.IO room)
   - Emit `room:state` (full RoomState) + `game:state` (player-specific view) to just this socket
   - Server log at info level with `{ mod: 'reconnect', userId, roomId }`
2. Add a dedicated event `room:resume` that the client can call explicitly (for cases where auto-join on connect raced with the client's router). Takes no args, returns `Ack<{ roomId: string } | null>`. Same behavior as auto-reconnect but returns the roomId to the client so it can navigate.

**Client:**
3. In `packages/client/src/lib/socketClient.ts` or equivalent, on `connect` event fire a `socket.emit('room:resume', cb)`. If ack returns a roomId and the user isn't already on `/room/:id`, route them there (use `react-router-dom`'s navigate; pull the nav hook via a small helper if needed — don't add a hook-outside-component anti-pattern).
4. Gate the auto-navigation behind a **prompt** if the user is currently on Lobby: show a toast/banner "您有一局游戏进行中 · 返回房间" with a dismiss button. Do not auto-yank them away silently. i18n key: `room.resumeBanner.title` + `.cta` + `.dismiss`.

**Tests (required):**
- `packages/server/src/socket/handlers.test.ts` (new or extend) — mock socket, seat userId A in room R, disconnect socket, reconnect new socket with same userId → expect `room:state` + `game:state` emitted to just new socket, `markReconnected` called once.
- `packages/server/src/socket/handlers.test.ts` — `room:resume` returns `{ ok: true, data: { roomId } }` when user has active room, `{ ok: true, data: null }` when not.

### Task B — Spectator Mode

**Shared types** (`packages/shared/src/types/socket.ts`):
1. Add `ClientEvents`:
   ```ts
   'room:spectate': (roomId: string, ack: (result: Ack<{ state: unknown }>) => void) => void;
   'room:unspectate': () => void;
   ```
2. Add `ServerEvents`:
   ```ts
   'spectator:state': (view: unknown) => void;  // public view only
   ```
3. Add to `RoomState` (in `packages/shared/src/types/room.ts`): `spectatorCount: number`.

**Game logic contract** (`packages/shared/src/types/game.ts` — find the logic interface):
4. Each game's `logic` exports a `view(state, playerId)` function today. Extend the interface with an **optional** `spectatorView(state): unknown` method. If a game doesn't implement it, fall back to a sanitized view (see Task B.6).
5. Update the following games to implement `spectatorView`:
   - **gomoku** — trivial; same as full state (no hidden info)
   - **connect-four** — same
   - **battleship** — hide both players' ship grids, show hit/miss grid only
   - **codenames** — hide spymaster grid (only reveal guessed colors)
   - **texas-holdem** / **liar-bar** — hide all player hole cards
   - **love-letter / splendor / uno / yahtzee / hive / undercover** — return state with all private hand/word/identity fields stripped

**Server** (`packages/server/src/engine/GameRoom.ts`):
6. Add `spectators: Set<string>` (userIds) + `spectatorSockets: Set<string>` (socketIds — for broadcast targeting). Or reuse a single `spectators: Map<userId, socketId>` if simpler.
7. Add method `addSpectator(userId, socketId)` / `removeSpectator(userId)`.
8. Add method `spectatorView()` that calls `logic.spectatorView?.(state)` or falls back to a default sanitizer (return state with `players[*].hand`, `players[*].hole`, `players[*].role`, `players[*].word`, `players[*].secret` keys deleted — shallow 1-level deep, safe default).
9. In `broadcastViews`, after broadcasting to players, also emit `'spectator:state'` with `spectatorView()` to every socketId in the spectator set.
10. Include `spectatorCount: this.spectators.size` in the RoomState the room emits.

**Server handlers** (`packages/server/src/socket/handlers.ts`):
11. `'room:spectate'` → look up room by id via RoomManager, reject if not found or not started yet (`room.state === 'waiting'` — spectators only allowed in `playing`/`ended`), call `room.addSpectator`, `socket.join(room.id)`, ack with `{ state: room.spectatorView() }`.
12. `'room:unspectate'` → find the room this socket is spectating (track socket.data.spectatingRoomId), call `room.removeSpectator`, `socket.leave(room.id)`.
13. On socket `disconnect`, if the socket was spectating, cleanup.
14. **Blocked-user check:** if the target room's host is in the user's block list (query `userBlocks`), reject with `error: 'blocked'`. (Skip if either party can't be identified — guest flows.)

**Client:**
15. Add a `<SpectatorView>` component in `packages/client/src/pages/GameRoom.tsx` (or a new route `/room/:id/watch`) that:
    - Connects via `room:spectate`
    - Subscribes to `spectator:state`
    - Renders the same `<GamePlayView>` as players, but reads `view` from spectator stream and passes a flag `isSpectator=true` to hide interactive controls.
16. In Lobby, when rendering a room that's in `playing` state, add a small "围观" (spectate) button. i18n key: `lobby.room.spectate`.

**Tests (required):**
- `packages/server/src/engine/GameRoom.test.ts` — add a test: seat 2 players (A, B), add spectator C, call `broadcastViews`, assert C received `spectator:state` (via mock io) with hole-card fields stripped (use a mock logic with `spectatorView` returning `{ foo: 'public' }` to keep it assertable).
- `packages/server/src/socket/handlers.test.ts` — spectator join / leave / auto-cleanup on disconnect.
- `packages/server/src/engine/GameRoom.test.ts` — `spectatorView` fallback strips sensitive keys from default logic.

## 3. Project hard constraints

- **ALL user-facing strings MUST go through i18n.** Zero hardcoded Chinese/English in `.tsx` rendered text. Add keys to **both** `packages/client/src/i18n/locales/zh/common.json` and `packages/client/src/i18n/locales/en/common.json` — they must stay in sync.
- Use the existing `t()` / `useTranslation()` hook. Never `t(key, { defaultValue: '中文兜底' })`.
- TypeScript strict; no `any` unless justified in a comment (prefer `unknown`).
- Socket payloads must stay minimal — don't leak full game state to spectators of games with hidden info.
- No new dependencies.
- Don't remove or rewrite existing code unless required by scope.
- Don't run `pnpm dev`. Don't push. Don't commit.

## 4. Verification

Run from project root:
1. `pnpm --filter @repo/server build` → expect green
2. `pnpm typecheck` → expect green (pre-existing root-level isolated-file noise OK; new errors NOT ok)
3. `pnpm test` → expect all pre-existing tests green + your new tests green. Report final `Tests  X passed (X)` count.
4. Grep: `rg -n '[\u4e00-\u9fff]+' packages/client/src/pages/GameRoom.tsx packages/client/src/**/*Spectator*.tsx 2>/dev/null` — should return zero matches in new/edited files.

## 5. Deliverable — ISSUE doc

Write `docs/ISSUE_stage3-reconnect-spectate.md` with 6 sections:
1. **Summary** — 2-3 sentences what was built
2. **Changes** — bulleted list of every file touched (server / client / shared / i18n / tests), with brief purpose for each
3. **Tests** — new test files + assertion counts, final total test count
4. **Out of scope** — anything you skipped and why (be honest — surface gaps; don't hide them)
5. **Manual e2e** — exact browser/CLI steps to demo reconnect + spectate (e.g. "1. Seat userA in room R; 2. Kill the socket via devtools; 3. Refresh page; 4. Observe auto-rejoin toast; 5. ...")
6. **Friction notes** — anything that was ambiguous, any prompt gap, any pitfall you hit

## 6. Execution order suggestion

1. Read ALL files in §1 first (don't skip — accuracy matters)
2. Add the new event types to `shared/src/types/socket.ts` and `room.ts`
3. Task A (reconnect) — simpler, builds on existing `markReconnected`
4. Task A tests
5. Task B (spectator) — more files
6. Task B tests
7. Run verification commands
8. Write ISSUE doc
9. STOP. Do not commit.

Begin now.
