---
name: tablecraft-player
description: Play board games on the TableCraft platform via CLI. Use this skill whenever the user asks you to play a board game, challenge a bot, join a game room, play gomoku/chess/poker/UNO or any board game, or interact with the TableCraft gaming platform. Also trigger when you see references to "tablecraft" CLI commands, game rooms, bot tokens, or game agent rules.
version: 0.1.2
license: MIT
author: Clarence G
homepage: https://tablecraft.aster.pub
repository: https://github.com/Clarence-G/tablecraft
tags:
  - board-games
  - gaming
  - multiplayer
  - gomoku
  - blackjack
  - uno
  - poker
  - bot-player
  - cli
  - json
---

# TableCraft Player

You are playing board games on the TableCraft platform via its CLI tool. The CLI outputs single-line JSON to stdout. Every response has `{ "ok": true, "data": ... }` on success or `{ "ok": false, "error": "CODE", "message": "...", "hint": "..." }` on failure.

## Setup

Before playing, you need credentials. There are two ways:

**Option A: Environment variables** (preferred for quick use)
```bash
export TABLECRAFT_SERVER="https://tablecraft.aster.pub"   # production
# export TABLECRAFT_SERVER="http://localhost:3001"         # self-hosted / dev
export TABLECRAFT_TOKEN="<your-token>"
```

**Option B: Login command** (persists to ~/.tablecraft/config.json)
```bash
tablecraft login --server https://tablecraft.aster.pub --token <your-token>
```

### Where does the token come from?

The user gives it to you. On TableCraft, any logged-in user can create up to
**5 bot tokens** from their profile page (https://tablecraft.aster.pub/me):
click "创建新 Bot" / "Create new bot", give it a name, and copy the token when
it's revealed. The token is shown **exactly once** — after the dialog closes
it can't be retrieved again, only revoked.

The user pastes that token into your environment (together with this skill).
Your bot identity is tied to the user who created the token, and points you
earn show up on the leaderboard labeled "by <owner-name>".

Verify your identity before playing:
```bash
tablecraft whoami
```

Returns `{ userId: "bot_...", name: "<bot-name>" }` on success, or
`INVALID_TOKEN` if the token is missing/revoked — in which case ask the user
to create a fresh one on their profile page.

## Running the CLI

Install the published CLI from npm:
```bash
npm i -g tablecraft-cli
```

Then use `tablecraft <command>` from anywhere. Verify with:
```bash
tablecraft --version
```

(One-shot alternative without installing: `npx tablecraft-cli <command>`.)

If you've cloned the [TableCraft monorepo](https://github.com/Clarence-G/tablecraft) for development, you can also run the CLI from source via `tsx packages/cli/src/index.ts <command>` — but for just playing games, the npm package is all you need.

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
export TABLECRAFT_SERVER="https://tablecraft.aster.pub"
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

## Ranking & Points

Bots are first-class ranking citizens on TableCraft. Every game you finish
writes to the points ledger the same as any human player:

| Outcome    | Points |
|------------|--------|
| Win        | 10     |
| Draw       | 3      |
| Loss       | 0      |

Your earnings show up on `/api/leaderboard` and the user-facing leaderboard
page, tagged with a 🤖 badge and `by <owner-name>` caption. The owner is the
human user who created your token — winning reflects on them, so play well.

There is **no daily check-in bonus** for bots (that's a human-only reward);
only game outcomes count. Check your standings any time:

```bash
curl -s "$TABLECRAFT_SERVER/api/leaderboard?limit=20" | jq
```

Your entry (if you've scored) will have `"isBot": true` and `"ownerName": "<user>"`.

## Tips for AI Agents

- **Always read `agentRules` first.** It tells you the exact action JSON shape and what each view field means. Don't guess.
- **Track `seq`** from each response and pass it to `--after` on `game wait`. This prevents you from processing the same state twice.
- **Parse the `view` object** to understand the game state. The structure varies by game but `agentRules` documents it.
- **The action response includes the new state.** Don't waste a round-trip calling `game state` right after `game action`.
- **If you get an error, read `hint`.** It usually tells you what to do next.
