# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# STAGE 2-B: Room persistence + AFK handler

You are the **persistence + AFK worker**. You make TableCraft rooms durable across server restarts AND handle disconnected players gracefully. These two concerns share the same files (`GameRoom`, `RoomManager`, `handlers`), so one worker owns both to avoid merge conflicts.

## Context

Stage 1 has already added:
- `chat_messages` table in `schema.ts`
- Migration `0004_*.sql` (auto-run by server on boot)
- `lib/logger.ts` (pino) — USE IT for new log lines
- Helmet + rate-limit in `index.ts`

Current problem (you're fixing):
- `GameRoom` state is pure in-memory. Server restart = all live games lost.
- `chatHistory` is in-memory too.
- When a player disconnects, rooms just... wait forever. `onPlayerDisconnect` is mostly unimplemented across games.

## Read FIRST

1. `CLAUDE.md` — project conventions
2. `packages/server/src/engine/GameRoom.ts` — the room class (~470 lines)
3. `packages/server/src/engine/RoomManager.ts` — the room registry (~108 lines)
4. `packages/server/src/socket/handlers.ts` — socket event handlers (~248 lines)
5. `packages/server/src/db/schema.ts` — confirm `rooms.stateJson`, `rooms.updatedAt` exist AND `chatMessages` table (added by Stage 1)
6. `packages/shared/src/types/engine.ts` — `GameLogic`, `onPlayerDisconnect` interface
7. `games/gomoku/logic.ts` + `games/love-letter/logic.ts` — see existing `onPlayerDisconnect` patterns (most games have none)

## What to build

### A. Room state persistence (write path)

After every successful `onAction`, `onTimer`, or `onPlayerDisconnect` that mutates state, and after `setup()`, persist to `rooms` table:

```ts
// In GameRoom.ts, add private method:
private async persistState(): Promise<void> {
  if (this.state == null) return;
  try {
    await db.update(rooms)
      .set({
        stateJson: JSON.stringify(this.state),
        status: this.status,
        updatedAt: new Date(),
        ...(this.status === 'finished' && { finishedAt: new Date() }),
      })
      .where(eq(rooms.id, this.roomId));
  } catch (err) {
    logger.error({ err, roomId: this.roomId, mod: 'gameroom' }, 'persistState failed');
    // Don't throw — persistence failure shouldn't kill live gameplay
  }
}
```

Call it after state transitions. Keep it non-blocking — `persistState()` returns void, errors logged not thrown.

### B. Chat message persistence

In `socket/handlers.ts` `chat:send` handler, after pushing to `room.chatHistory`, also insert into `chatMessages`:

```ts
await db.insert(chatMessages).values({
  roomId: room.roomId,
  userId: socket.data.userId,
  userName: /* derived name */,
  text: rawText,
}).execute();
```

Fire-and-forget with `.catch(err => logger.warn(...))` to not block broadcast. Keep `chatHistory` in-memory cap at 50; DB is the full history.

On room hydrate (next section), load last 50 chat messages into `chatHistory` so clients joining see recent history.

### C. Room hydration on server boot

In `RoomManager.ts`, add:

```ts
async hydrate(): Promise<number> {
  const rows = await db.select().from(rooms).where(
    or(eq(rooms.status, 'playing'), eq(rooms.status, 'waiting'))
  );
  let count = 0;
  for (const row of rows) {
    try {
      if (!row.stateJson) continue;
      const state = JSON.parse(row.stateJson);
      const players = await db.select().from(roomPlayers)
        .where(eq(roomPlayers.roomId, row.id))
        .orderBy(roomPlayers.seatIndex);
      const recentChat = await db.select().from(chatMessages)
        .where(eq(chatMessages.roomId, row.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);
      const room = GameRoom.fromPersisted(row, state, players, recentChat.reverse());
      this.rooms.set(row.id, room);
      count++;
    } catch (err) {
      logger.error({ err, roomId: row.id, mod: 'room-manager' }, 'hydrate failed for room');
    }
  }
  logger.info({ count, mod: 'room-manager' }, 'hydrated rooms from db');
  return count;
}
```

Add `GameRoom.fromPersisted(row, state, players, chatMessages)` static factory. It should produce a `GameRoom` that looks identical to one created live, minus any transient state (timers — **do not restore timers**, they'll reset fresh).

Call `await roomManager.hydrate()` in `server/src/index.ts` AFTER `initDb()` completes, BEFORE `httpServer.listen()`.

### D. AFK / disconnect handler

In `handlers.ts`, find the `socket.on('disconnect', ...)` handler. Current code likely does nothing game-wise. Add:

```ts
// Grace period: 30s to reconnect before AFK action taken.
// Reconnect itself is Stage 3's job; you just set the timer here.
socket.on('disconnect', () => {
  const userId = socket.data.userId;
  const roomId = socket.data.roomId;
  if (!userId || !roomId) return;

  const room = roomManager.get(roomId);
  if (!room || room.status !== 'playing') return;

  // Schedule AFK handler via TimerManager (30s)
  timerManager.scheduleOnce(`afk:${roomId}:${userId}`, 30_000, async () => {
    // Stage 3's reconnect will cancel this via timerManager.cancel(key).
    // If not cancelled, the player is considered AFK.
    try {
      const result = room.handleAfk(userId);   // you add this method
      if (result.stateChanged) {
        io.to(roomId).emit('game:state', /* view */);
        await room.persistState();
      }
    } catch (err) {
      logger.error({ err, roomId, userId, mod: 'afk' }, 'afk handler failed');
    }
  });
});
```

`TimerManager` already exists (`engine/TimerManager.ts`); add `scheduleOnce(key, ms, fn)` and `cancel(key)` if not present.

`GameRoom.handleAfk(userId)` logic:
1. If game logic has `onPlayerDisconnect`, call it → apply state + events.
2. Else fallback: log `logSystem('log.playerTimeout', { messageParams: { playerId: userId } })` and do nothing destructive. The game just keeps its current turn; other players see a "玩家离线" banner via notification.
3. Mark the player `isConnected: false` in state (for view rendering) — but do NOT remove them from the room.

### E. Disconnect indicator in views

In each `getPlayerView`, the current code doesn't expose "is this other player online?". Don't touch 15 games' logic files. Instead, add a **view-wrapper** in `GameRoom.ts`:

```ts
getPlayerView(playerID: string) {
  const view = this.logic.getPlayerView(this.state, playerID, this.ctx);
  // Augment with connection status — doesn't require logic.ts changes.
  return {
    ...view,
    _connected: this.getConnectedPlayerIds(),  // string[] of currently-connected userIds
  };
}
```

Clients that want to show "offline" badges read `view._connected`. Prefix `_` signals engine-augmented field.

Track `connectedPlayerIds: Set<string>` on `GameRoom`. Socket `join`/`disconnect`/`reconnect` updates it. Hydrate sets it empty (nobody connected yet).

### F. Tests

Add these tests:

1. `packages/server/src/engine/GameRoom.persistence.test.ts`:
   - create room → setup → action → check `rooms.stateJson` updated in DB
   - re-instantiate room via `fromPersisted` → state matches original
   
2. Extend `packages/server/src/engine/GameRoom.test.ts`:
   - disconnect player → AFK timer fires after 30s (use fake timers) → game advances via `onPlayerDisconnect` path
   - cancel AFK (simulating reconnect) → timer doesn't fire

3. `packages/server/src/engine/RoomManager.hydrate.test.ts`:
   - seed DB with 2 playing rooms → `hydrate()` → `roomManager.get()` works for both

Target: ≥10 new assertions across these.

## Hard constraints

1. **DO NOT edit**:
   - Any `games/*/logic.ts` (don't touch game logic)
   - `packages/server/src/db/schema.ts` (Stage 1 owns schema)
   - `packages/server/src/lib/auth.ts`, `lib/email.ts` (Stage 2-C owns)
   - `packages/server/src/api/reports.ts` if exists, `lib/moderation.ts` (Stage 2-D owns)
   - `packages/server/src/api/router.ts` unless adding a specific new endpoint (don't; record in ISSUE if you think you need)
   - Client code — reconnection on client is Stage 3's job

2. **DO edit**:
   - `engine/GameRoom.ts` (persistence + AFK handler + view augmentation)
   - `engine/RoomManager.ts` (hydrate)
   - `engine/TimerManager.ts` (add scheduleOnce/cancel if needed)
   - `socket/handlers.ts` (only the disconnect handler + chat persistence + track connectedPlayerIds; do NOT add reconnect logic, Stage 3 does that)
   - `server/src/index.ts` (call `await roomManager.hydrate()` after initDb)

3. **Use the Stage-1 logger**: `import { logger } from '../lib/logger'` — for new log lines. Don't migrate every existing `console.log`.

4. **No emoji anywhere**. **Use lucide icons for any UI (none in your scope).**

5. **Chat reconnect handling**: On `socket:connect` when a user was already in a room, the existing code sends `chat:history`. Your persistence means `chatHistory` may have been hydrated from DB — the existing emit path just works.

## Validation

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test   # your persistence/AFK tests
pnpm test                          # full suite — 495+ tests should still pass
curl -s http://localhost:3001/api/health
```

Then **manual e2e**:
1. Create a room, start a game, make a move (using CLI — see `~/.hermes/skills/software-development/tablecraft-dev-server/scripts/cli-two-bot-probe.sh`)
2. Query DB via the API/state to confirm `stateJson` populated
3. Kill server (SIGTERM), restart, confirm `roomManager.get(roomId)` returns the room with same state via `/api/rooms/:id/state`

## Deliverables

1. `rooms.stateJson` persisted after every mutation
2. `chatMessages` table populated on `chat:send`
3. `RoomManager.hydrate()` restores playing/waiting rooms on boot
4. AFK timer fires 30s after disconnect, runs `handleAfk(userId)`
5. `view._connected` exposed to clients
6. Tests green: ≥10 new assertions
7. `docs/ISSUE_stage2-persist-afk.md` with 6-section template

## Out of scope (record, don't do)

- Client-side reconnect (Stage 3)
- Spectator mode (Stage 3)
- Moving `chatHistory` from in-memory entirely to DB (keep both)
- Timer-state persistence (game-timer state inside games — just don't persist SET_TIMER events; let them reset on restart)
- Cleanup of old finished rooms (archival — out of scope)

START NOW.
