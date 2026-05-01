# Stage 3-B: Reconnect & Spectator Mode

## Summary

Implements two features for a more robust and social game experience:
- **Reconnect resume banner** — when a socket reconnects from the lobby, the client asks the server if the user has an active room and shows a dismissible banner prompting them to return
- **Spectator mode** — any user can watch a playing game in real time without being a seated player; games with hidden information expose only safe public views to spectators

## Files Changed

### Shared types (`packages/shared/src/types/`)
- **`room.ts`** — added `spectatorCount: number` to `RoomState`; added `status: RoomStatus` to `RoomSummary`
- **`socket.ts`** — added `room:resume`, `room:spectate`, `room:unspectate` to `ClientEvents`; added `spectator:state` to `ServerEvents`
- **`board.ts`** — added `isSpectator?: boolean` to `BoardProps`

### Server (`packages/server/src/`)
- **`engine/GameRoom.ts`** — `spectators: Map<userId, socketId>`, `addSpectator`, `removeSpectator`, `spectatorView()` (with `getSpectatorView` fallback + PRIVATE_KEYS sanitizer), `emitSpectators` hook; `broadcastViews` now pushes `spectator:state`; `toRoomState` includes `spectatorCount`; `toRoomSummary` includes `status`
- **`engine/RoomManager.ts`** — added `listActiveRooms()` (waiting + playing, excludes finished/full)
- **`socket/handlers.ts`** — `room:resume` handler; `room:spectate` handler (block-check via `userBlocks`); `room:unspectate` handler; disconnect cleanup for spectators; `room:list` now uses `listActiveRooms`; `room:start` skips spectators when distributing initial views

### Games
- **`games/texas-holdem/logic.ts`** — `getSpectatorView`: hides hole cards until showdown phase
- **`games/yahtzee/logic.ts`** — `getSpectatorView`: identical to `getPlayerView` (no hidden state)

### Client (`packages/client/src/`)
- **`App.tsx`** — on socket `connect` emits `room:resume`; shows `ResumeBanner` when ack returns a roomId and user is on lobby; added `/rooms/:roomId/watch` route with `SpectatorRoute` component; passes `onRoomSpectated` to Lobby and `onSpectateRoom` to RoomsAll
- **`pages/SpectatorView.tsx`** — new page: emits `room:spectate`, listens to `spectator:state` + `room:state`, renders full `GameRoomLayout` with `<Board isSpectator>`, emits `room:unspectate` on unmount
- **`pages/Lobby.tsx`** — added `onRoomSpectated` prop; passes `spectateLabel` and `onSpectate` to `RoomCard`
- **`pages/RoomsAll.tsx`** — shows "Watch" button for playing rooms, "Join" for waiting rooms
- **`pages/lobby/sections.tsx`** — `RoomCard` accepts `onSpectate?` and `spectateLabel?`; renders Watch vs Join based on `room.status`
- **`i18n/locales/zh/common.json`** — added `room.resumeBanner.*`, `lobby.room.spectate`
- **`i18n/locales/en/common.json`** — matching English keys

## Design Decisions

**Reconnect banner vs auto-navigate**: The spec mandates a prompt on lobby, not a silent redirect. `room:resume` fires on every socket `connect` event. On reconnect while already inside a room route the banner is suppressed (path check via `window.location.pathname`).

**Spectator block-check**: The server checks `userBlocks` only for authenticated users; guests proceed without a check. DB errors are caught and silently skipped so a transient failure does not prevent spectating.

**`spectatorView` fallback**: When a game has no `getSpectatorView`, the engine strips keys named `hand`, `hole`, `holeCards`, `role`, `word`, `secret` from each player object. This is a best-effort sanitizer; games with sensitive state should implement the explicit method.

**`RoomSummary.status`**: Required to let the lobby and RoomsAll distinguish joinable rooms (waiting) from spectatable ones (playing) without a separate API call.

## Verification

```bash
pnpm typecheck          # passes
pnpm --filter @repo/server build  # passes
pnpm test               # 31 files, 475 tests pass
```
