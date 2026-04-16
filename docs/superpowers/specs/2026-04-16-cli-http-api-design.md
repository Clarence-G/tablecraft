# CLI & HTTP API Design Spec

Agent-friendly CLI and REST API for programmatic access to the tabletop game platform.

## Goals

- AI agents can discover games, join rooms, play, and observe results entirely through CLI / HTTP
- New games require zero CLI or API changes — the engine layer is fully generic
- Bot and human players are equal participants in the same room system
- Actions are idempotent where possible; errors are semantic and actionable

## 1. GameMeta Extension

Add two fields to `GameMeta` in `packages/shared/src/types/engine.ts`:

```typescript
export interface GameMeta {
  // ... existing fields ...
  rules?: string;       // Human-readable game rules (displayed in room UI)
  agentRules?: string;  // Machine-readable rules for agents (action format, view schema, error cases)
}
```

- `rules` — natural language, shown to human players in the room waiting screen
- `agentRules` — mechanical instruction format: action schema, PlayerView fields, win conditions, illegal moves
- Each game's `shared.ts` populates both fields
- CLI and REST serve `agentRules`; frontend serves `rules`

## 2. REST API

### Base

All endpoints under `/api/*`. JSON request/response. Authentication via `Authorization: Bearer <token>` header.

### Response Format

Success:
```json
{ "ok": true, "data": { ... } }
```

Error:
```json
{ "ok": false, "error": "ERROR_CODE", "message": "Human-readable detail", "hint": "Actionable suggestion for agent" }
```

### Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_TOKEN` | Token missing, invalid, or expired |
| `UNKNOWN_GAME` | gameId does not exist in registry |
| `ROOM_NOT_FOUND` | roomId does not exist |
| `ROOM_FULL` | Room has reached maxPlayers |
| `GAME_NOT_STARTED` | Room is in `waiting` state, cannot submit action |
| `GAME_ALREADY_STARTED` | Cannot join a room that is already `playing` |
| `NOT_YOUR_TURN` | Action submitted but it's another player's turn |
| `INVALID_ACTION` | Action does not pass Zod schema validation |
| `ACTION_REJECTED` | Action is schema-valid but rejected by game logic (with reason) |
| `NOT_IN_ROOM` | Player is not a member of this room |
| `NOT_HOST` | Only the room host can perform this operation |
| `PLAYERS_NOT_READY` | Not all players are ready |
| `TOO_MANY_ROOMS` | Agent has reached concurrent room limit |

### Endpoints

#### Authentication

**POST /api/auth/login**

Exchange token for identity confirmation.

Request: `Authorization: Bearer <token>` header
Response: `{ "userId": "bot_abc", "name": "ClaudeBot" }`

#### Game Discovery

**GET /api/games**

List all registered game types.

Response: `[{ "id": "gomoku", "name": "...", "minPlayers": 2, "maxPlayers": 2, "agentRules": "..." }, ...]`

**GET /api/games/:gameId**

Single game detail including `agentRules`.

#### Room Management

**GET /api/rooms**

List joinable rooms (status=waiting, not full).

Query params: `?game=gomoku` (optional filter)

Response: `[{ "roomId": "ABC123", "gameId": "gomoku", "hostName": "...", "playerCount": 1, "maxPlayers": 2 }, ...]`

**POST /api/rooms**

Create a room. Creator auto-joins and auto-readies (bot).

Body: `{ "gameId": "gomoku", "config": optional }`
Response: `{ "roomId": "ABC123", "gameId": "gomoku", "status": "waiting", "players": [...] }`

**GET /api/rooms/:id**

Room state: players, status, host, config.

**POST /api/rooms/:id/join**

Join a room. Bot auto-readies. Idempotent: joining a room you're already in returns success.

Body: `{}` (empty)
Response: Room state

**POST /api/rooms/:id/leave**

Leave a room. Idempotent: leaving a room you're not in returns success.

**POST /api/rooms/:id/start**

Start the game. Host only. Requires all players ready.

Response: Room state (status changes to `playing`)

#### Game Play

**GET /api/rooms/:id/state**

Current PlayerView for the authenticated player.

Response:
```json
{
  "view": { ... },
  "roomStatus": "playing",
  "seq": 12,
  "result": null
}
```

When finished:
```json
{
  "view": { ... },
  "roomStatus": "finished",
  "seq": 20,
  "result": { "rankings": ["player_a", "player_b"], "myRank": 1 }
}
```

**POST /api/rooms/:id/action**

Submit a game action. Response includes the updated state (saves a round-trip).

Body: `{ "action": { "type": "place", "row": 7, "col": 7 }, "seq": 12 }`

- `seq` is optional. If provided, duplicate seq is silently ignored (idempotent) and returns current state unchanged.
- If omitted, server auto-assigns next seq.

Response (success): same format as GET state, with updated view and new seq.

**GET /api/rooms/:id/wait**

Long poll. Blocks until room state changes or timeout.

Query params:
- `after` — (optional) seq number. Only return when seq > after. If omitted, CLI/server tracks last known seq.
- `timeout` — (optional) max seconds to wait, default 30, max 120.

Response when changed:
```json
{ "changed": true, "view": { ... }, "roomStatus": "playing", "seq": 14, "result": null }
```

Response on timeout:
```json
{ "changed": false }
```

Implementation: server holds the request open. Internally uses a Promise that resolves when `GameRoom.seq` increments past `after`. CLI auto-retries on HTTP timeout transparently.

## 3. Server Architecture

### File Structure

```
packages/server/src/
  index.ts              — mount socket.io + REST
  api/
    router.ts           — Express router for /api/*
    auth.ts             — bot token middleware
    wait.ts             — long poll manager
  engine/
    GameRoom.ts         — add seq tracking + wait notification
    RoomManager.ts      — unchanged
  socket/
    auth.ts             — unchanged
    handlers.ts         — unchanged
```

### GameRoom Changes

Add state change tracking:

```typescript
class GameRoom {
  seq: number = 0;
  private waiters: Array<(seq: number) => void> = [];

  private onStateChanged(): void {
    this.seq++;
    const cbs = this.waiters.splice(0);
    for (const cb of cbs) cb(this.seq);
  }

  waitForChange(afterSeq: number, timeoutMs: number): Promise<number | null> {
    if (this.seq > afterSeq) return Promise.resolve(this.seq);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((cb) => cb !== resolve);
        resolve(null);
      }, timeoutMs);
      const cb = (seq: number) => { clearTimeout(timer); resolve(seq); };
      this.waiters.push(cb);
    });
  }
}
```

Call `onStateChanged()` after successful `handleAction` and `handleTimer`. Also call on room status transitions (waiting -> playing, playing -> finished).

### Bot Auto-Ready

`GameRoom.join` accepts `isBot` flag:

```typescript
join(playerID: string, name: string, isBot = false): Ack<void> {
  // ... existing logic ...
  this.players.set(playerID, { id: playerID, name, ready: isBot, connected: true, seatIndex });
}
```

### PlayerInfo Extension

```typescript
export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  seatIndex: number;
  isBot: boolean;  // new
}
```

### Token Management

In-memory for now, database-backed later:

```typescript
class TokenStore {
  private tokens = new Map<string, { userId: string; name: string }>();

  generate(name: string): { token: string; userId: string } { ... }
  verify(token: string): { userId: string; name: string } | null { ... }
}
```

### Co-existence Rules

- REST and Socket.IO share the same `RoomManager` instance
- Notification paths are independent: Socket.IO uses `emitToPlayer`; REST uses `waitForChange`
- `GameRoom` is caller-agnostic — it only sees `playerID`, not transport

## 4. CLI Design

### Package Structure

```
packages/cli/
  package.json
  tsconfig.json
  src/
    index.ts          — entry point, command routing
    commands/
      login.ts        — login / whoami
      games.ts        — games list / games rules
      rooms.ts        — rooms list / create / join / leave / start / show
      game.ts         — game state / action / wait
    lib/
      client.ts       — HTTP client (fetch + auth + error handling)
      config.ts       — ~/.tabletop/config.json read/write
```

### Dependencies

Zero external dependencies. Uses Node.js built-in `fetch` (Node 18+), hand-written arg parsing.

### Commands

#### Auth
```
tabletop login --server <url> --token <token>
tabletop whoami
```

#### Game Discovery
```
tabletop games list
tabletop games rules <gameId>
```

#### Room Management
```
tabletop rooms list [--game <gameId>]
tabletop rooms create <gameId>
tabletop rooms show <roomId>
tabletop rooms join <roomId>
tabletop rooms leave <roomId>
tabletop rooms start <roomId>
```

#### Game Play
```
tabletop game state <roomId>
tabletop game action <roomId> '<json>'
tabletop game wait <roomId> [--after <seq>] [--timeout <seconds>]
```

### Output Convention

- stdout: single-line JSON (machine-parseable)
- stderr: human-readable hints (if any)
- Exit code 0 = success, 1 = error

### Wait Behavior

`game wait` internally long-polls with 30s HTTP requests, auto-retrying on timeout. From the agent's perspective it blocks until state changes. `--after` is optional; if omitted, CLI uses the seq from its last response in this invocation.

### Environment Variable Overrides

- `TABLETOP_SERVER` — overrides configured server URL
- `TABLETOP_TOKEN` — overrides configured token

Priority: CLI flag > env var > config file.

## 5. Publishing

npm package `tabletop-cli` with `bin.tabletop`. Installable via:

```
npm install -g tabletop-cli
npx tabletop-cli
```

Standalone binary via `bun build --compile` on GitHub Releases (optional, later).

## 6. Agent Game Loop

Complete flow for an AI agent:

```
tabletop login --server http://localhost:3001 --token xxx
tabletop games rules gomoku
tabletop rooms create gomoku
tabletop game wait ABC123                        # wait for opponent + game start
loop:
  # state is in the wait/action response
  # agent decides next move...
  tabletop game action ABC123 '{"type":"place","row":7,"col":7}'
  # response includes new state
  if roomStatus == "finished": break
  tabletop game wait ABC123 --after <seq>        # wait for opponent
  if roomStatus == "finished": break
```

## 7. Idempotency Summary

| Operation | Idempotent behavior |
|-----------|-------------------|
| join (already in room) | Returns success |
| leave (not in room) | Returns success |
| ready (already ready) | N/A (bot auto-ready on join) |
| action (duplicate seq) | Silently ignored, returns current state |
| wait (already changed) | Returns immediately with current state |
