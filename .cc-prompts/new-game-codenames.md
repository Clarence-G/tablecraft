# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# Implement a new board game: **Codenames** (行动代码)

You are a game-implementation worker. Your job: implement the Codenames game end-to-end inside this monorepo (TableCraft), following the project's established patterns exactly. Read, then execute.

## Workspace & context files to read FIRST (in this order)

1. `docs/ACTIVITY_LOG.md` — notification pipeline contract
2. `games/_template/logic.ts`, `games/_template/shared.ts`, `games/_template/Board.tsx`, `games/_template/i18n/zh.json`, `games/_template/i18n/en.json` — the scaffold you will start from
3. `games/gomoku/logic.ts`, `games/gomoku/logic.test.ts` — simplest reference game
4. `games/love-letter/logic.ts`, `games/love-letter/shared.ts`, `games/love-letter/i18n/zh.json` — reference for a game with PRIVATE information per player (spymaster keycard ↔ Love Letter card hands)
5. `games/love-letter/Board.tsx` — reference for a Board UI that branches on role
6. `packages/shared/src/types/engine.ts` — `GameLogic`, `ActionResult`, `EngineEvent`, `GameMeta`
7. `packages/shared/src/logging/log.ts` — `logAction`, `logSystem` helpers
8. `scripts/new-game.ts` — what `pnpm new:game` does (you will use it)
9. `games/server-registry.ts` — auto-generated; check the format (you will re-run `pnpm gen:registry`)

## What to build

### Game identity
- **id**: `codenames`
- **name_zh**: `行动代码`, **name_en**: `Codenames`
- **minPlayers**: 4, **maxPlayers**: 8
- **estimatedMinutes**: 15
- **tags**: `["推理", "团队", "派对"]` (zh) / `["deduction", "team", "party"]` (en)
- **icon**: `Lightbulb` (Lucide) or leave a comment and let default icon apply
- **scene**: paper-surface theme with subtle accent; reference `games/uno/shared.ts` for scene shape if unsure. Skip scene if unsure — don't invent.

### Rules (authoritative — implement exactly this)
1. **Teams**: two teams, `red` and `blue`. Each team has exactly one **spymaster** and ≥1 **operative**. Players pick their team + role in the waiting room (see `setPlayerState` below).
2. **Start condition**: can only start when both teams have ≥1 spymaster and ≥1 operative, and total players ≥4. First team (red) has 9 words, second team (blue) has 8, plus 7 bystanders and **1 assassin**. First team is chosen randomly at `setup()`.
3. **Board**: 5×5 grid = 25 words drawn without replacement from the word pool in the current game's language (see Words below). A random key-card (matching the 25-word layout) is generated in `setup()` and only visible to spymasters via `getPlayerView`.
4. **Turn structure**:
   - spymaster of the active team gives a clue: `{ type: 'giveClue', word: string, count: number }` where `count ∈ {0,1,...,9}` or `'unlimited'` (represent as `count: number | 'unlimited'`; schema `z.union([z.number().int().min(0).max(9), z.literal('unlimited')])`)
   - operatives then submit one guess at a time: `{ type: 'guess', cellIndex: number }`. Operatives may **end their turn voluntarily** with `{ type: 'endGuessing' }` only after at least 1 guess (or 0 if the clue was `count: 0`).
   - maximum guesses in a turn = `count + 1` for numeric counts (unlimited means unlimited). `count: 0` lets them stop anytime including immediately.
   - If operatives reveal their own team's word: it stays their turn (up to max guesses); their word tile is marked revealed-for-its-team.
   - If they reveal a bystander: turn ends.
   - If they reveal the opposing team's word: turn ends (and opposing team progresses toward their goal).
   - If they reveal the **assassin**: game ends instantly, opposing team wins.
5. **Clue validation**: do NOT semantically validate the clue word (free-form creativity). BUT reject the action if `word` is empty, if `word` contains any of the 25 board words as a substring (case-insensitive), or if it's given outside the spymaster's team's turn.
6. **Win condition**: first team to reveal all their own words wins; OR assassin revealed → opposing team wins.

### Words (i18n)
- Create `games/codenames/i18n/zh/words.json` and `games/codenames/i18n/en/words.json`, each a JSON array of **at least 400 unique words**.
- **Generate the lists yourself** — pick common, concrete, single-token words (objects, animals, actions, roles). Don't borrow copyrighted Codenames lists verbatim; aim for similar feel but your own wording.
- Load the list at `setup()` based on `ctx.locale` or a new `meta.locale` hint; if not available in context, accept it as a parameter in setup or fall back to zh if the server's env doesn't tell. Inspect the shared types to see what's actually exposed to `setup(ctx)` — use whatever IS available (hint: there's often no locale; in that case pick a deterministic default based on `ctx.seed` or random).
- **CRITICAL**: do NOT put any user-facing text in `logic.ts`. All strings flow through i18n.

### Team / role selection UI
Players need to pick their team and role. Add action types:
- `{ type: 'joinTeam', team: 'red' | 'blue', role: 'spymaster' | 'operative' }` — allowed only during `lobby` phase, before any clue has been given. One spymaster per team is enforced; a second `joinTeam` with role `spymaster` on a team that already has one should reject. A player can switch teams/roles freely until the game starts.
- Game refuses to "progress" (i.e., the first `giveClue` is rejected) until both teams have ≥1 spymaster and ≥1 operative.

Wait — the existing engine doesn't have an explicit "lobby → playing" transition owned by logic; the room `start()` just calls `setup()`. So handle this in `setup()`: if the ctx.players don't map onto valid teams, you can't know their choices yet because roles are picked post-setup.

**Simplest workable design**: make team/role selection part of the in-game state. `setup()` assigns everyone to `spectators` (no team). The first action allowed is `joinTeam`. A separate action `{ type: 'commitTeams' }` (fire-able by any player once teams are valid) transitions `phase` from `'setup'` to `'clue'` and draws the board + keycard (use `ctx.seed` for determinism). Before `commitTeams`, the board/keycard don't exist — `view.board === null`.

If this conflicts with how other games do it, prefer the pattern that fits TableCraft: look at how `love-letter` handles the pre-round state.

### Board UI
Keep it simple but functional:
- 5×5 grid of word tiles. Spymaster sees the colored keycard overlay; operatives see gray tiles, with revealed tiles colored by their revealed team.
- Side panel: clue input (spymaster only on their turn), guesses-remaining indicator, current-team badge, current clue display.
- Team roster section: shows who is on each team + spymaster tag.
- Rules button / how-to; minimal. Use `useTranslation('codenames')` and key every string.

### Activity log
Emit:
- `logAction(playerID, 'log.joinTeam', { team, role })` on `joinTeam`
- `logSystem('log.gameStart', { firstTeam })` on `commitTeams`
- `logAction(spymasterID, 'log.clue', { word, count })` on `giveClue`
- `logAction(playerID, 'log.guess', { cell: indexStr, result: 'own' | 'bystander' | 'opponent' | 'assassin' })` on `guess`
- `logAction(playerID, 'log.endGuessing')` on `endGuessing`
- `logSystem('log.win', { actorId: winningTeamLeadPlayerID, team })` on win (actorId optional — can be the team keyword if you prefer; see how other games do team wins)

## Hard constraints

1. **Only modify files under `games/codenames/`.** DO NOT touch:
   - `packages/**` (shared, game-ui, client, server)
   - Any OTHER game's `games/<id>/`
   - `packages/client/src/i18n/locales/**` (those are global/cross-game)
   - `docs/ACTIVITY_LOG.md` (it's a contract, not docs to extend)

   EXCEPTION: `games/server-registry.ts` is auto-regenerated by `pnpm gen:registry` — don't edit it by hand, but DO run `pnpm gen:registry` at the end. `games/client-registry.ts` is glob-auto so requires nothing.

2. **Use the scaffold**: `cd /Users/bytedance/Projects/boardgames && pnpm new:game codenames` first. That copies `_template/` to `games/codenames/` and rewrites `package.json` etc. You then edit inside `games/codenames/`.

3. **All user-visible strings go through i18n** (`games/codenames/i18n/{zh,en}.json` + `words.json`). Zero hardcoded Chinese or English in `logic.ts` / `Board.tsx` (except JSX attribute like className or logic.ts internal keys). Helpers like `logAction` take `messageKey` — that IS the i18n key.

4. **i18n parity**: every key present in `zh.json` must be in `en.json` and vice versa. Words lists have the same count ± nothing — both ≥400.

5. **Tests** (`games/codenames/logic.test.ts`): ≥8 assertions covering:
   - setup produces 25 words, 9/8/7/1 keycard split
   - `joinTeam` switches roles and rejects duplicate spymaster
   - `commitTeams` only works when teams are valid
   - `giveClue` is rejected when word appears on the board
   - `guess` correctly reveals and updates whose-turn / guesses-remaining
   - revealing the assassin ends the game with opposing team as winner
   - revealing all of your own words wins the game
   - ≥1 assertion on `NOTIFY_ALL` payload `{ channel: 'log', messageKey: 'log.clue' }`

6. **TypeScript strict**: no `any` sneaking in unless unavoidable. Prefer `z.infer` types from schema.

7. **Activity log params**: `messageParams` is `Record<string, string | number | boolean>`. No objects/arrays/undefined. If you need to pass a team/player, pass a string.

## Validation (MANDATORY — run these, copy output into your ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Regenerate the server registry (picks up the new game)
pnpm gen:registry

# 2. Type-check
pnpm typecheck

# 3. Run YOUR game's tests
pnpm --filter @games/codenames test

# 4. End-to-end via CLI bots:
#    (dev server is already running on :3001; check it's alive)
curl -s http://localhost:3001/api/health
```

Then do **CLI e2e**: create 4 bot tokens, join + set teams + commit + give clue + guess. Confirm `/api/rooms/:id/state` returns `.data.notifications` containing `{ channel: 'log', messageKey: 'log.clue', ... }`. See `docs/ACTIVITY_LOG.md` and the existing per-bot `HOME=/tmp/tc-*` pattern the prior workers used.

Then do **UI e2e via browser**: dev server runs on http://localhost:5174 (or :5173 — check). Open the Lobby, sign in as guest, create a codenames room, open 3 more browser tabs/sessions (or use incognito + a different guest name) to fill 4 players, set teams, click Start (or equivalent), and play at least 1 clue + 1 guess. Use Playwright / `browser_*` tools / manual-screenshot-attached-to-ISSUE. If you can't get 4 real tabs, simulate 3 via CLI bots and one via browser.

## Deliverables (your job isn't done until all exist)

1. `games/codenames/` fully implemented (logic + Board + i18n + words + tests)
2. `pnpm typecheck` green
3. `pnpm --filter @games/codenames test` green (≥8 assertions)
4. CLI e2e confirms `channel: 'log'` notifications flow through `/state`
5. UI e2e: at least 1 screenshot showing the board rendered with either spymaster keycard visible or operative tiles + clue input
6. **`docs/ISSUE_codenames.md`** — your issue log. Template:

```markdown
# Issues encountered: Codenames

## Infrastructure gaps
- [ISSUE-1] <anything missing in shared/ engine that forced a workaround>
- ...

## Prompt clarity
- [ISSUE-A] <ambiguities in this prompt or contradictions with project conventions>
- ...

## Bugs found during testing
- [ISSUE-B] <runtime/type/test bugs you hit — include stack traces>
- ...

## Design choices I made where prompt was silent
- [ISSUE-C] <explain each judgment call>
- ...

## Deferred / future work
- [ISSUE-D] <out-of-scope suggestions>
- ...

## Validation output
```
<paste: typecheck, game tests, CLI e2e state response, UI screenshot path>
```
```

Fill every section honestly. Empty sections write "None." — don't omit them.

## Out of scope

- Translations beyond zh + en
- Spectator mode beyond what falls out naturally
- Custom word lists uploaded by users
- Timer / clock
- Animations / sound

## If you find a bug in shared infrastructure

DO NOT fix it in `packages/**`. Record it in `docs/ISSUE_codenames.md` under Infrastructure gaps. The orchestrator will triage across both workers.

START NOW. Read files, run `pnpm new:game codenames`, implement, test, verify, write ISSUE doc.
