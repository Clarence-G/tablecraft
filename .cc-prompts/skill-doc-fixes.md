# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped documentation fix task. Skip straight to execution — read files, make edits, verify. No clarifying questions, no companion offers.

# Parallel-worker note

You are running in parallel with other workers editing OTHER files in `/Users/bytedance/Projects/boardgames`. Your scope is ONLY the `~/.hermes/skills/tablecraft/**` directory — not the project repo. You will not conflict. Do NOT `git stash` / `git reset` / `git checkout` anything, anywhere.

# Task

Fix 5 documented drift issues in the TableCraft skill files. These were found by a recent CLI + architecture audit. All fixes are doc-only edits under `~/.hermes/skills/tablecraft/**`.

## Background (read first)

TableCraft is the pnpm monorepo at `/Users/bytedance/Projects/boardgames`. The `packages/cli/` package is a CLI bot client (@repo/cli). The shipped docs drifted from the actual implementation in 2-3 places, plus 3 broken paths left over from a skill directory reorg (skills used to live under `~/.hermes/skills/software-development/tablecraft-*` but were moved to `~/.hermes/skills/tablecraft/*` during a 2026-05 restructure).

## Files to read first

1. `~/.hermes/skills/tablecraft/tablecraft-dev-server/SKILL.md` — 16401 chars
2. `~/.hermes/skills/tablecraft/tablecraft-dev-server/scripts/cli-two-bot-probe.sh` — 3653 chars
3. `~/.hermes/skills/tablecraft/tablecraft-new-game-cc/SKILL.md`
4. `~/.hermes/skills/tablecraft/tablecraft-new-game-cc/templates/new-game-prompt.md`
5. `~/.hermes/skills/tablecraft/tablecraft-cc-orchestration/SKILL.md` (scan only; no edits expected)
6. `/Users/bytedance/Projects/boardgames/packages/cli/src/index.ts`
7. `/Users/bytedance/Projects/boardgames/packages/cli/src/lib/config.ts` — confirm `TABLECRAFT_SERVER` / `TABLECRAFT_TOKEN` env var precedence
8. `/Users/bytedance/Projects/boardgames/packages/cli/src/commands/login.ts` and `games.ts` and `rooms.ts` and `game.ts` — confirm actual response contracts

## The 5 fixes (exact edits required)

### Fix 1 — Broken path in `tablecraft-dev-server/SKILL.md` around line 135

Look for any occurrence of `~/.hermes/skills/software-development/tablecraft-dev-server/` and replace with `~/.hermes/skills/tablecraft/tablecraft-dev-server/`. There should be exactly one hit. Use `patch` (replace mode) with enough surrounding context to ensure uniqueness.

### Fix 2 — Broken path in `tablecraft-new-game-cc/SKILL.md` around line 131

Look for any occurrence of `~/.hermes/skills/software-development/tablecraft-new-game-cc/` and replace with `~/.hermes/skills/tablecraft/tablecraft-new-game-cc/`. Exactly one hit.

### Fix 3 — Broken path in `tablecraft-new-game-cc/templates/new-game-prompt.md` around line 129

Same pattern — `~/.hermes/skills/software-development/tablecraft-new-game-cc/` → `~/.hermes/skills/tablecraft/tablecraft-new-game-cc/`.

After fix 1-3, run this sanity grep and confirm zero hits:

```bash
rg "software-development/tablecraft-" ~/.hermes/skills/tablecraft/
```

### Fix 4 — Document the `shoot-room.ts` screenshot script in `tablecraft-dev-server/SKILL.md`

This script exists at `/Users/bytedance/Projects/boardgames/scripts/shoot-room.ts` but is not mentioned in the skill. It takes playwright screenshots of a waiting room (desktop + mobile) for visual QA.

Find the section in `tablecraft-dev-server/SKILL.md` that lists the screenshot scripts (look for `shoot-games.ts` or `shoot-lobby.ts`). Add a bullet/paragraph for `shoot-room.ts` in the same style. Describe: it creates a room, waits for the waiting-room UI to render, and screenshots both desktop (1440x900) and mobile (390x844) viewports into `screenshots/room/`. Useful after changes to `packages/client/src/pages/Room.tsx`.

### Fix 5 — Document CLI environment-variable auth in `tablecraft-dev-server/SKILL.md`

Currently the skill only documents the `tablecraft login --token <token>` config-file flow. But the CLI ALSO accepts `TABLECRAFT_SERVER` and `TABLECRAFT_TOKEN` environment variables that take precedence over the config file (see `packages/cli/src/lib/config.ts`). This is the cleaner option for CI / automated probes — no need for `HOME=/tmp/xxx` tricks.

Find the CLI-related section (look for `tablecraft login`, `cli-two-bot-probe.sh`, or `TokenStore`) and add a subsection or paragraph explaining:

- Precedence: env vars > config file
- Two vars: `TABLECRAFT_SERVER` (default `http://localhost:3001`), `TABLECRAFT_TOKEN`
- Example:
  ```bash
  TABLECRAFT_TOKEN=xxx pnpm --filter @repo/cli exec tsx src/index.ts games list
  ```
- Note this makes the `cli-two-bot-probe.sh` script simpler — no temp HOME dir needed.

Also double-check `scripts/cli-two-bot-probe.sh` in the skill — if it uses `HOME=/tmp/...` gymnastics, note in a comment block that env-var auth is the modern alternative, but DO NOT rewrite the script itself (other probes may depend on the exact shape).

### Fix 6 (bonus) — Clarify dev-mode vs built-binary in `tablecraft-dev-server/SKILL.md`

If the skill says `tablecraft <command>` as the canonical invocation, add a note that in dev (inside the monorepo, no global install), the correct form is:

```bash
pnpm --filter @repo/cli exec tsx src/index.ts <command>
```

and that `tablecraft` as a bare binary only works after `pnpm --filter @repo/cli build` produces `./dist/index.js`. Mention the `bin: tablecraft -> ./dist/index.js` line in `packages/cli/package.json`.

### Fix 7 (bonus) — Clarify bot auto-ready semantics

Somewhere in the relevant skill (`tablecraft-dev-server` or `tablecraft-cc-orchestration` — whichever talks about rooms/bots) add a note: **bots are auto-set to `ready:true` on create/join**, and `rooms start` skips the "all players ready" check for bot-only rooms. There is no separate `bot ready` CLI command needed. This came up during CLI audit.

## Constraints

- ONLY edit files under `~/.hermes/skills/tablecraft/**`. Do NOT touch the project repo.
- Use the Edit / Write tools. Prefer surgical Edit with enough context.
- After each edit, re-read the changed section and confirm the text reads coherently.
- Preserve the original formatting style (headings, code fences, bullets).

## Validation (run before reporting done)

```bash
# 1. Broken paths gone
rg "software-development/tablecraft-" ~/.hermes/skills/tablecraft/ || echo "OK: no matches"

# 2. shoot-room.ts is mentioned
rg "shoot-room\.ts" ~/.hermes/skills/tablecraft/tablecraft-dev-server/SKILL.md

# 3. env-var auth is documented
rg "TABLECRAFT_TOKEN" ~/.hermes/skills/tablecraft/tablecraft-dev-server/SKILL.md

# 4. dev-vs-dist note is present (look for the pnpm --filter tsx form)
rg "pnpm --filter @repo/cli exec tsx" ~/.hermes/skills/tablecraft/tablecraft-dev-server/SKILL.md

# 5. bot auto-ready note
rg -i "auto[- ]?ready" ~/.hermes/skills/tablecraft/

# 6. No syntax breakage — the SKILL.md files should still open cleanly
ls -la ~/.hermes/skills/tablecraft/*/SKILL.md
```

## Deliverable

When done, write a short report to stdout (your final message) with:

1. Paths of all files edited
2. For each of the 7 fixes: a one-line "done" or "not applicable — already correct (evidence: ...)"
3. Output of each validation grep above
4. Any prompt ambiguities or skill-internal inconsistencies you noticed

Do NOT commit anything. Skill files are not under git in the project repo; they live in `~/.hermes/skills/` which is managed separately.

START NOW.
