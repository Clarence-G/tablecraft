# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# Implement a new board game: **Undercover** (谁是卧底)

You are a game-implementation worker. Your job: implement the 谁是卧底 / Undercover game end-to-end inside this monorepo (TableCraft), following the project's established patterns exactly. Read, then execute.

## Workspace & context files to read FIRST (in this order)

1. `docs/ACTIVITY_LOG.md` — notification pipeline contract
2. `games/_template/logic.ts`, `games/_template/shared.ts`, `games/_template/Board.tsx`, `games/_template/i18n/zh.json`, `games/_template/i18n/en.json` — scaffold you will start from
3. `games/gomoku/logic.ts`, `games/gomoku/logic.test.ts` — simplest reference game
4. `games/love-letter/logic.ts`, `games/love-letter/shared.ts`, `games/love-letter/i18n/zh.json`, `games/love-letter/Board.tsx` — reference for game with PRIVATE information per player (each player has their own card / word)
5. `games/liar-bar/logic.ts` — reference for rotating turns + voting-style eliminations
6. `packages/shared/src/types/engine.ts` — `GameLogic`, `ActionResult`, `EngineEvent`, `GameMeta`
7. `packages/shared/src/logging/log.ts` — `logAction`, `logSystem` helpers
8. `scripts/new-game.ts` — what `pnpm new:game` does (you will use it)

## What to build

### Game identity
- **id**: `undercover`
- **name_zh**: `谁是卧底`, **name_en**: `Undercover`
- **minPlayers**: 3, **maxPlayers**: 12
- **estimatedMinutes**: 10
- **tags**: `["推理", "派对", "语言"]` (zh) / `["deduction", "party", "social"]` (en)
- **icon**: `UserSecret` or `Ghost` via Lucide (pick any available) or leave a comment
- **scene**: optional; skip if unsure rather than inventing

### Rules (authoritative — implement exactly this)
1. **Roles**:
   - Everyone is either `civilian` (multiple, all share word A) or `undercover` (minority, all share word B, with A and B being a related but different word pair).
   - Undercover count by player count: 3-4 players → 1 undercover; 5-7 players → 1 undercover; 8-12 players → 2 undercover.
   - No blanks / 白板 in v1.
2. **Word pairs**: load from `games/undercover/i18n/zh/pairs.json` and `games/undercover/i18n/en/pairs.json`. Each file: JSON array of `{ civilian: string, undercover: string }`. Generate ≥150 pairs per language yourself — related-but-distinct, concrete, single-token (e.g., 猫/狗, coffee/tea, sword/knife, rain/snow). Pick the pair at `setup()` based on `ctx.seed` or random.
3. **Role assignment**: at `setup()`, shuffle seats, assign undercover slot(s) randomly. Each player only sees their own word (via `getPlayerView`).
4. **Phases**:
   - **describe**: each alive player, in seat order starting from the first surviving player, submits a `{ type: 'describe', text: string }` action, text 1-50 chars. Once everyone alive has submitted this round, move to vote phase.
   - **vote**: each alive player submits `{ type: 'vote', targetId: string }`. Target must be another alive player (cannot vote self). When all alive players have voted: tally.
     - Unique highest → that player is eliminated (role revealed to all).
     - Tie → **re-describe tied players only**, then re-vote; if still tied, randomly eliminate one (deterministic via seed).
5. **Elimination / win check** after each elimination:
   - If any undercover is still alive AND civilians still outnumber undercovers → new describe round (only alive players speak).
   - If all undercovers eliminated → **civilians win**.
   - If alive undercovers count ≥ alive civilians count → **undercovers win**.
6. **Eliminated players** do not vote, do not describe. Their view still shows their word + the reveal of eliminated roles.

### i18n (MANDATORY)
- `i18n/zh.json`: game meta strings + UI strings (yourWord, currentSpeaker, voteFor, eliminated, civilianWins, undercoverWins, etc.) + `log.*` keys
- `i18n/en.json`: same keys, English values
- `i18n/zh/pairs.json` and `i18n/en/pairs.json`: ≥150 pairs each
- **Zero hardcoded zh/en strings** in logic.ts or Board.tsx

### Activity log
Emit:
- `logSystem('log.roundStart', { round })` when a new describe round begins
- `logAction(playerID, 'log.describe', { round, text })` on `describe` (NOTE: `text` is player-authored content, it's OK to pass through — everyone will see descriptions anyway; this isn't leaking)
- `logAction(playerID, 'log.vote', { targetId })` — WAIT. Sidebar log should NOT leak vote targets until reveal. So instead: `logAction(playerID, 'log.voteSubmitted')` without target; then after tally, emit `logSystem('log.eliminated', { targetId, role })`.
- `logSystem('log.civilianWins')` or `logSystem('log.undercoverWins')` at game end

### Board UI
- **Describe phase**: show current speaker's name, highlight self if it's you, `<input>` + Send button if it's your turn; otherwise disabled. Show transcript of this round's descriptions so far.
- **Vote phase**: show all alive players with a vote button (disabled if self / eliminated / already voted).
- **Reveal banner**: after elimination, show `"{name} 出局，身份: 卧底"` for 3 seconds (use React state — don't block engine).
- **Your word card**: always shows your word. If eliminated, shows word + "你已出局".
- `useTranslation('undercover')` — every string keyed.

## Hard constraints

1. **Only modify files under `games/undercover/`.** DO NOT touch:
   - `packages/**` (shared, game-ui, client, server)
   - Any OTHER game's `games/<id>/`
   - `packages/client/src/i18n/locales/**`
   - `docs/ACTIVITY_LOG.md`

   EXCEPTION: `games/server-registry.ts` is auto-regenerated by `pnpm gen:registry` — don't edit it by hand, but DO run `pnpm gen:registry` at the end. `games/client-registry.ts` is glob-auto so requires nothing.

2. **Use the scaffold**: `cd /Users/bytedance/Projects/boardgames && pnpm new:game undercover` first. Then edit inside `games/undercover/`.

3. **All user-visible strings through i18n**. Zero hardcoded Chinese/English in logic.ts / Board.tsx.

4. **i18n parity**: keys match across zh/en; pair counts match.

5. **Tests** (`games/undercover/logic.test.ts`): ≥8 assertions covering:
   - setup assigns correct undercover count for 3p / 5p / 8p
   - each player's view shows only their own word
   - describe actions rejected out of turn
   - all-alive-described → transitions to vote phase
   - vote must target alive non-self player
   - tie re-describe triggers
   - assassin-style insta-win: when civilians eliminate the (only) undercover → civilian win event
   - undercover survives to parity → undercover win event
   - ≥1 assertion on `NOTIFY_ALL` payload `{ channel: 'log', messageKey: 'log.eliminated' }`

6. **TypeScript strict**, no loose `any`. Use `z.infer` where possible.

7. **Activity log params**: `Record<string, string | number | boolean>`. No objects/arrays/undefined.

## Validation (MANDATORY — run these, copy output into your ISSUE doc)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Regenerate the server registry
pnpm gen:registry

# 2. Type-check
pnpm typecheck

# 3. Run YOUR game's tests
pnpm --filter @games/undercover test

# 4. End-to-end via CLI bots
curl -s http://localhost:3001/api/health
```

Then **CLI e2e**: create 3 bot tokens, join room, start, each describe in turn, each vote, confirm tally + elimination + view/state. Check `/state` `.data.notifications` contains `{ channel: 'log', messageKey: 'log.eliminated', ... }`.

Then **UI e2e via browser**: dev server runs on http://localhost:5174 (or :5173). Open Lobby, sign in as guest, create an undercover room; have 3 browser tabs (or use incognito) join to fill 3 players. Play through describe phase + vote phase + see elimination banner. Take screenshot(s).

## Deliverables

1. `games/undercover/` fully implemented (logic + Board + i18n + pairs + tests)
2. `pnpm typecheck` green
3. `pnpm --filter @games/undercover test` green (≥8 assertions)
4. CLI e2e confirms `channel: 'log'` notifications flow through `/state`
5. UI e2e: ≥1 screenshot showing a describe phase or vote phase in the real UI
6. **`docs/ISSUE_undercover.md`** — your issue log. Template:

```markdown
# Issues encountered: Undercover

## Infrastructure gaps
- [ISSUE-1] <anything missing in shared/ engine that forced a workaround>
- ...

## Prompt clarity
- [ISSUE-A] <ambiguities in this prompt or contradictions with project conventions>
- ...

## Bugs found during testing
- [ISSUE-B] <runtime/type/test bugs — include stack traces>
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

- Blanks / 白板 role
- Multi-round "best of N" format
- Spectator mode beyond what falls out naturally
- Timer / clock
- Animations / sound

## If you find a bug in shared infrastructure

DO NOT fix it in `packages/**`. Record it in `docs/ISSUE_undercover.md` under Infrastructure gaps. The orchestrator will triage.

START NOW. Read files, run `pnpm new:game undercover`, implement, test, verify, write ISSUE doc.
