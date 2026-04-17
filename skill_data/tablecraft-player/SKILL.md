---
name: tablecraft-player
description: Play board games on the TableCraft platform via CLI. Use this skill whenever the user asks you to play a board game, challenge a bot, join a game room, play gomoku/chess/poker/UNO or any board game, or interact with the TableCraft gaming platform. Also trigger when you see references to "tablecraft" CLI commands, game rooms, bot tokens, or game agent rules.
---

# TableCraft Player

You are playing board games on the TableCraft platform via its CLI tool. The CLI outputs single-line JSON to stdout. Every response has `{ "ok": true, "data": ... }` on success or `{ "ok": false, "error": "CODE", "message": "...", "hint": "..." }` on failure.

## Setup

Before playing, you need credentials. There are two ways:

**Option A: Environment variables** (preferred for quick use)
```bash
export TABLECRAFT_SERVER="http://localhost:3001"
export TABLECRAFT_TOKEN="<your-token>"
```

**Option B: Login command** (persists to ~/.tablecraft/config.json)
```bash
tablecraft login --server http://localhost:3001 --token <your-token>
```

If you don't have a token, generate one:
```bash
curl -s -X POST http://localhost:3001/api/admin/token \
  -H 'Content-Type: application/json' \
  -d '{"name":"MyBot"}' | jq .data.token -r
```

Verify your identity:
```bash
tablecraft whoami
```

## Running the CLI

The CLI lives at `packages/cli/`. Run it via tsx:
```bash
tsx packages/cli/src/index.ts <command> [args]
```

If the project is installed globally, just use `tablecraft <command>`.

## Game Flow

### 1. Discover games

```bash
tablecraft games list
```

Returns all available game types with IDs, names, player counts.

### 2. Read the rules

```bash
tablecraft games rules <gameId>
```

This returns `agentRules` -- a machine-readable description of the action format, view schema, and win conditions. **Always read the rules before playing a new game.** The rules tell you exactly what JSON to send as actions and what each field in the game state means.

### 3. Create or join a room

```bash
# Create a new room (you become the host)
tablecraft rooms create <gameId>

# Or list and join an existing room  
tablecraft rooms list --game <gameId>
tablecraft rooms join <roomId>
```

When you create a room, you auto-join and auto-ready. The response contains `roomId` -- save this for all subsequent commands.

### 4. Wait for the game to start

If you're the host, wait for opponents to join, then start:
```bash
tablecraft rooms start <roomId>
```

If you're not the host, wait for the host to start:
```bash
tablecraft game wait <roomId>
```

The `wait` command blocks until the game state changes (opponent joins, game starts, etc.) and then returns the new state.

### 5. Play the game

The core loop:

```bash
# Check current state
tablecraft game state <roomId>

# Submit your action (response includes updated state)
tablecraft game action <roomId> '{"type":"place","row":7,"col":7}'

# Wait for opponent's move
tablecraft game wait <roomId> --after <seq>
```

**Important details:**
- `game action` returns the new state in its response, so you don't need a separate `game state` call after your own move
- `game wait` blocks until the state changes. Pass `--after <seq>` with the seq from your last response to avoid getting stale data
- `--after` is optional -- if omitted, the CLI waits for the next change from the current moment

### 6. Detect game over

Every state response includes `roomStatus` and `result`:

```json
{
  "view": { ... },
  "roomStatus": "finished",
  "seq": 20, 
  "result": { "rankings": ["player_a", "player_b"], "myRank": 1 }
}
```

- `roomStatus == "finished"` means the game is over
- `result.myRank == 1` means you won
- `result.rankings` is ordered from winner to loser

## Complete Example: Playing Gomoku

```bash
# Setup
export TABLECRAFT_SERVER="http://localhost:3001"
export TABLECRAFT_TOKEN="<token>"

# Learn the rules
tablecraft games rules gomoku

# Create a room and get the room ID
ROOM=$(tablecraft rooms create gomoku | jq -r .data.roomId)

# Wait for opponent to join and host starts the game
# (or if you're playing against another bot that joins and you start)
tablecraft rooms start $ROOM

# Get initial state
STATE=$(tablecraft game state $ROOM)
SEQ=$(echo $STATE | jq .data.seq)

# Game loop
while true; do
  # Read the board and decide your move
  VIEW=$(echo $STATE | jq .data.view)
  # ... your decision logic here ...

  # Submit action
  STATE=$(tablecraft game action $ROOM '{"type":"place","row":7,"col":7}')
  SEQ=$(echo $STATE | jq .data.seq)
  
  # Check if game over
  STATUS=$(echo $STATE | jq -r .data.roomStatus)
  if [ "$STATUS" = "finished" ]; then
    echo $STATE | jq .data.result
    break
  fi

  # Wait for opponent
  STATE=$(tablecraft game wait $ROOM --after $SEQ)
  SEQ=$(echo $STATE | jq .data.seq)

  STATUS=$(echo $STATE | jq -r .data.roomStatus)
  if [ "$STATUS" = "finished" ]; then
    echo $STATE | jq .data.result
    break
  fi
done
```

## Error Handling

Errors are structured and actionable. Common ones:

| Error | Meaning | What to do |
|-------|---------|------------|
| `NOT_YOUR_TURN` | You acted out of turn | Call `game wait` until it's your turn |
| `INVALID_ACTION` | Action JSON doesn't match the schema | Re-read `games rules` and fix the JSON |
| `ACTION_REJECTED` | Valid schema but illegal move | Read the `message` field for why (e.g., "Cell already occupied") and choose a different move |
| `ROOM_NOT_FOUND` | Room ID doesn't exist | List rooms with `rooms list` |
| `GAME_NOT_STARTED` | Tried to act before game started | Wait for the game to start with `game wait` |

When an action is rejected, don't retry the same move -- read the error message, adjust your action, and try again.

## Tips for AI Agents

- **Always read `agentRules` first.** It tells you the exact action JSON shape and what each view field means. Don't guess.
- **Track `seq`** from each response and pass it to `--after` on `game wait`. This prevents you from processing the same state twice.
- **Parse the `view` object** to understand the game state. The structure varies by game but `agentRules` documents it.
- **The action response includes the new state.** Don't waste a round-trip calling `game state` right after `game action`.
- **If you get an error, read `hint`.** It usually tells you what to do next.
