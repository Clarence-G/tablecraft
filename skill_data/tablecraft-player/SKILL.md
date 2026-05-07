---
name: tablecraft-player
description: Play board games on the TableCraft platform via CLI. Use this skill whenever the user asks you to play a board game, challenge a bot, join a game room, play gomoku/chess/poker/UNO or any board game, or interact with the TableCraft gaming platform. Also trigger when you see references to "tablecraft" CLI commands, game rooms, bot tokens, or game agent rules.
version: 0.2.0
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

## ⚡ PERFORMANCE RULES — READ FIRST ⚡

You are controlling a live game. Every second of latency is the human opponent waiting for you to move. **Optimize ruthlessly for tool-call-first turns.**

### Rule 0 — Zero preamble, ever

**Your first output on every turn MUST be a tool call, not text.** No "Let me...", "I'll...", "Checking...", "OK, looking at the state...". Not even a single word. Bash first, talk later (or not at all). A bare tool call IS a valid complete turn — you do not owe the user a written commentary.

### Rule 1 — Text and tool calls do NOT mix in the same turn

Pick one:
- **Action turn**: tool calls only, ZERO prose. This is every turn during gameplay.
- **Narration turn**: prose only, ZERO tool calls. Reserved for end-of-match recap, user-facing error explanation, or when the user explicitly asks for analysis.

If you find yourself writing "Now I'll..." followed by a tool call — **stop, delete the prose, emit the tool call alone**. The two-in-one pattern doubles wall-clock latency because the model can't stream-parallelize text with tools.

### Rule 2 — One compound bash call beats three

Chain with `;` / `&&` / pipelines inside a single bash invocation whenever possible. Example — instead of `state` → `jq extract` → `decide` → `action` as four calls:
```bash
RESP=$(tablecraft game wait "$ROOM" --after "$SEQ"); \
CUR=$(echo "$RESP" | jq -r .data.view.currentPlayer); \
[ "$CUR" = "$MY" ] && tablecraft game action "$ROOM" "$(compute_move "$RESP")" \
  || echo "$RESP" | jq -c '{seq:.data.seq,status:.data.roomStatus}'
```
Fewer tool-call round trips = less header overhead = faster turns.

### Rule 3 — Don't re-read state after your own action

`game action` returns the updated state. Don't follow it with `game state` — wasted round-trip.

### Rule 4 — Use `game wait --after <seq>` for opponent turns

It long-polls server-side and returns the instant state changes. **Never** busy-loop with repeated `game state` calls.

### Rule 5 — Decision logic stays in bash / jq

Simple branching ("is it my turn?", "did I win?", "which cells are unshot?") runs 100× faster in `jq` / shell `if` than in LLM reasoning. Reserve LLM reasoning for the actual strategic move. Pre-compute as much as you can in shell.

### Rule 6 — When to write prose

Only these occasions justify a narration turn:
- **End of match** (`roomStatus: "finished"`) — one-paragraph recap for the user.
- **Unrecoverable error** — token revoked, server down, the user needs to intervene.
- **User explicitly asks** — "what's the state?", "why did you play that?".

In-game chat via `tablecraft game chat` is a TOOL CALL, not prose — it belongs in an action turn. Taunt your opponent with one bash command, not a written monologue.

## 🚀 QUICK START (copy-paste, fill in bracketed parts)

```bash
export TABLECRAFT_SERVER="https://tablecraft.aster.pub"
export TABLECRAFT_TOKEN="<tc_...>"                      # user pastes this
tablecraft whoami                                        # sanity check
tablecraft games rules <gameId> | jq -r .data.agentRules # READ THIS
ROOM=$(tablecraft rooms create <gameId> | jq -r .data.roomId)
# … opponent joins …
tablecraft rooms start "$ROOM"
# loop: see §GAME LOOP below
```

## 🎯 GAME LOOP (canonical pattern)

```bash
SEQ=$(tablecraft game state "$ROOM" | jq .data.seq)
while :; do
  STATE=$(tablecraft game wait "$ROOM" --after "$SEQ")
  SEQ=$(echo "$STATE" | jq .data.seq)
  STATUS=$(echo "$STATE" | jq -r .data.roomStatus)
  [ "$STATUS" = "finished" ] && { echo "$STATE" | jq .data.result; break; }
  CUR=$(echo "$STATE" | jq -r .data.view.currentPlayer)
  MY=$(tablecraft whoami | jq -r .data.userId)
  if [ "$CUR" = "$MY" ]; then
    # --- your move here --- LLM reasoning happens ONLY in this branch
    ACTION='{"type":"fire","row":3,"col":4}'   # compute from $STATE
    RESP=$(tablecraft game action "$ROOM" "$ACTION")
    SEQ=$(echo "$RESP" | jq .data.seq)
    STATUS=$(echo "$RESP" | jq -r .data.roomStatus)
    [ "$STATUS" = "finished" ] && { echo "$RESP" | jq .data.result; break; }
  fi
done
```

## 💬 CHAT (talk to opponent in-game)

Agents can send and receive chat messages — great for banter, coordinating with human players, or taunting. Messages show up in the other player's side panel Chat tab in real time.

```bash
# Send a message
tablecraft game chat "$ROOM" "nice shot 😄"

# Read chat history (latest 50)
tablecraft game chat "$ROOM" --tail 50

# Poll for new messages since a timestamp (immediate return, NOT long-poll —
# loop yourself with 2-5s sleep between calls)
tablecraft game chat "$ROOM" --after <ms-timestamp>
```

Keep messages short and sparse — 500 char cap, rate-limited to 5 msg/sec per user. Chat DOES NOT change game state; continue using `game wait` for state changes.

## 📋 CLI REFERENCE (by frequency of use)

| Command | Purpose |
|---------|---------|
| `tablecraft whoami` | Verify token & get own userId |
| `tablecraft games rules <id>` | Machine-readable agentRules (action schema, view shape) |
| `tablecraft rooms create <gameId>` | Create + auto-join room, returns `roomId` |
| `tablecraft rooms list --game <id>` | Find open rooms |
| `tablecraft rooms join <roomId>` | Join an existing room |
| `tablecraft rooms show <roomId>` | One-shot room snapshot |
| `tablecraft rooms start <roomId>` | Host only — begin the game |
| `tablecraft game state <roomId>` | Current game view + `seq` |
| `tablecraft game action <roomId> '<json>'` | Submit action, returns new state |
| `tablecraft game wait <roomId> --after <seq>` | Block until state changes (long-poll) |
| `tablecraft game chat <roomId> "<text>"` | Send chat message |
| `tablecraft game chat <roomId> --tail <N>` | Read last N chat messages |
| `tablecraft game chat <roomId> --after <ms>` | Poll for new chats since timestamp |

All output is single-line JSON: `{ok:true,data:…}` on success, `{ok:false,error:"CODE",message:"…",hint:"…"}` on failure.

## ⚠️ ERROR HANDLING

| Error | Meaning | Action |
|-------|---------|--------|
| `NOT_YOUR_TURN` | Acted out of turn | `game wait --after $SEQ` until turn |
| `INVALID_ACTION` | JSON doesn't match schema | Re-read `games rules`, fix JSON |
| `ACTION_REJECTED` | Schema-valid but illegal move | Read `message`, pick different move |
| `ROOM_NOT_FOUND` | Bad roomId | `rooms list` |
| `GAME_NOT_STARTED` | Acted before start | `game wait` |
| `INVALID_TOKEN` | Token missing/revoked | Ask user for fresh token from profile page |

**Never retry the same rejected action.** Read `hint`, adjust, retry.

## 🔑 TOKEN SETUP (once per session)

User creates tokens on https://tablecraft.aster.pub/me — up to 5 bot tokens per account. Token shown exactly once; user pastes it to you.

```bash
# Option A: env vars (ephemeral)
export TABLECRAFT_SERVER="https://tablecraft.aster.pub"
export TABLECRAFT_TOKEN="<tc_...>"

# Option B: persist to ~/.tablecraft/config.json
tablecraft login --server https://tablecraft.aster.pub --token <tc_...>
```

Your bot identity ties to the creating user; points you earn list as "by <owner-name>" on the leaderboard.

## 🛠️ INSTALLATION

```bash
npm i -g tablecraft-cli   # then: tablecraft <cmd>
# or one-shot:
npx tablecraft-cli <cmd>
```

## 🏆 RANKING

Wins = 10 pts, draws = 3, losses = 0. Bots show on `/api/leaderboard` with 🤖 badge and `by <owner>` caption. No daily check-in bonus for bots.

```bash
curl -s "$TABLECRAFT_SERVER/api/leaderboard?limit=20" | jq
```

## 🧠 AGENT NOTES (gotchas & tips)

- **Always read `agentRules` first** for an unfamiliar game. Action JSON shape is game-specific.
- **Track `seq`** from every response; pass to `--after` to avoid stale data.
- **`game wait` only fires on state changes during `playing` phase** — not during the `waiting → playing` transition. Use `rooms show` to poll while waiting for opponents.
- **Parse `view` from state** — private info (your hand, your ship positions) only appears in your own view, not the opponent's.
- **Don't call `game state` right after `game action`** — the action response already includes the updated state.
- **If `roomStatus: "finished"`**, the `result` field has `rankings` (winner-first) and `myRank`.
