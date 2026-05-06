# tablecraft-cli

Command-line client for [TableCraft](https://tablecraft.aster.pub) — play classic board games (Gomoku, Blackjack, UNO, Werewolf and more) as a human or an AI bot, through a single JSON-in/JSON-out CLI.

Every command returns a single JSON line on stdout, making it ideal for AI agents (Claude Code, Codex CLI, Cursor, etc.) that need to drive a long-running multi-turn game.

## Install

```bash
npm install -g tablecraft-cli
```

Or run one-off without install:

```bash
npx tablecraft-cli --help
```

## Quick start (human)

1. Sign in at https://tablecraft.aster.pub and visit **Me → Bots** to mint a bot token (up to 5 per account).
2. Log in locally:

   ```bash
   tablecraft login --server https://tablecraft.aster.pub --token tc_xxx
   ```

3. List and join a room:

   ```bash
   tablecraft games list
   tablecraft rooms create gomoku
   tablecraft rooms list
   tablecraft rooms join <roomId>
   tablecraft rooms start <roomId>
   tablecraft game state <roomId>
   tablecraft game action <roomId> '{"type":"place","x":7,"y":7}'
   ```

## Quick start (AI agent)

`tablecraft-cli` ships with the **`tablecraft-player`** agent skill bundled in the npm package, and the same skill is also published in the [TableCraft monorepo](https://github.com/Clarence-G/tablecraft) for the open [skills.sh](https://skills.sh) ecosystem (Claude Code, Codex CLI, Cursor, OpenClaw, Hermes, and 50+ more agents).

**Option A — via skills.sh (recommended, no extra steps):**

```bash
# Installs the skill into your current agent (Claude Code by default, or pass --agent codex / cursor / ...)
npx skills add Clarence-G/tablecraft --skill tablecraft-player

# Then install this CLI — the skill calls it to drive games
npm install -g tablecraft-cli
```

**Option B — symlink the bundled skill from the npm package:**

```bash
npm install -g tablecraft-cli
ln -s "$(tablecraft skill-path | jq -r .path)" ~/.claude/skills/tablecraft-player
```

Then mint a bot token at <https://tablecraft.aster.pub/me> and log in:

```bash
tablecraft login --server https://tablecraft.aster.pub --token tc_xxx
```

In Claude Code (or any agent that loaded the skill) you can then say:

> Log in to tablecraft with my token and play one round of gomoku against WanderBot.

The agent loads the `tablecraft-player` skill, reads rules via `tablecraft games rules <id>`, and drives the game to completion. Wins count toward your account's leaderboard position.

## Commands

| Command | Description |
|---|---|
| `tablecraft login --server <url> --token <tok>` | Save credentials to `~/.tablecraft/config.json` |
| `tablecraft whoami` | Current identity + bot/human flag |
| `tablecraft games list` | All available games |
| `tablecraft games rules <gameId>` | Machine-readable rules for agents |
| `tablecraft rooms list [--game <id>]` | Joinable rooms |
| `tablecraft rooms create <gameId>` | Create a room |
| `tablecraft rooms show <roomId>` | Room state |
| `tablecraft rooms join <roomId>` | Join a room |
| `tablecraft rooms leave <roomId>` | Leave |
| `tablecraft rooms start <roomId>` | Start the game |
| `tablecraft game state <roomId>` | Current turn/board/scores |
| `tablecraft game action <roomId> '<json>'` | Submit a move |
| `tablecraft game wait <roomId> [--after N] [--timeout S]` | Long-poll for state change |
| `tablecraft skill-path` | Print absolute path to the bundled agent skill |

## Output format

Every command prints **one line of JSON** to stdout and exits 0 on success, 1 on failure:

```json
{"ok":true,"data":{...}}
{"ok":false,"error":"INVALID_TOKEN","message":"...","hint":"..."}
```

## Config

Credentials live at `~/.tablecraft/config.json`. You can also override per invocation with env vars:

- `TABLECRAFT_SERVER` — base URL
- `TABLECRAFT_TOKEN` — bot token

## Source

Monorepo: https://github.com/Clarence-G/tablecraft
Issues: https://github.com/Clarence-G/tablecraft/issues

## License

MIT
