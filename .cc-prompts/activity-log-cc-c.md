**SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.**

# ActivityLog Integration — CC Worker Prompt

You are integrating the ActivityLog feature into a TableCraft board game. Your job is a **focused, well-defined** task: emit Activity Log notifications from the assigned games' `logic.ts`, write i18n keys, and add tests.

## What's been set up for you

The infrastructure is complete. You do NOT need to touch any shared code.

- **Helpers** (from `@repo/shared`):
  - `logAction(actorId, messageKey, messageParams?)` — player action log
  - `logSystem(messageKey, { actorId?, messageParams? })` — neutral event
  - `logPrivate(to, messageKey, { actorId?, messageParams?, kind? })` — private reveal
- **Contract**: `docs/ACTIVITY_LOG.md` — READ THIS FIRST
- **Reference implementation**: `games/gomoku/logic.ts` and `games/gomoku/i18n/{zh,en}.json` — follow this pattern

## Your games

- **liar-bar** — 中：出牌+质疑机制，**已有一处 NOTIFY_ALL payload: { type:"challenge_result", message:"中文..." } 需改成 logSystem("log.challengeResult", {...params}) + 对应 i18n**。
- **love-letter** — 中：角色卡效果，**保留现有 3 处 `NOTIFY { payload: { type: "priest_peek"/"baron_compare" } }`——那是 UI 私有通道，不是 log**。另外补 logAction/logSystem。
- **texas-holdem** — 高：翻牌/转牌/河牌四阶段下注。

## Hard constraints

1. **ONLY modify files under `games/<id>/`** for your assigned games. Specifically:
   - `games/<id>/logic.ts` — emit `logAction` / `logSystem` events
   - `games/<id>/logic.test.ts` — add ≥1 assertion per game on `lastEvents`
   - `games/<id>/i18n/zh.json` and `games/<id>/i18n/en.json` — add `log.*` keys

2. **DO NOT touch these files** (another worker or the orchestrator owns them):
   - `packages/client/src/i18n/locales/*/common.json` — top-level i18n, shared
   - `packages/client/src/i18n/locales/*/game-ui.json` — shared UI, not per-game
   - `packages/shared/src/**` — contract, finalized
   - `packages/game-ui/src/**` — rendering, finalized
   - `packages/client/src/pages/Game.tsx` — bridge, finalized
   - `packages/server/src/**` — engine, finalized
   - `games/server-registry.ts` — auto-generated; don't edit
   - Any other game's `games/<other-id>/` directory

3. **ALWAYS use the helpers**, never hand-author `{ type: 'NOTIFY_ALL', payload: {...} }`. The helpers make `channel: 'log'` impossible to forget.

4. **i18n keys under `log.*`** — for example `log.move`, `log.win`, `log.deal`, `log.bet`. Keep them flat (one level of nesting max).

5. **Pass player identity via `actorId`**, never hardcode player names into `messageParams`. The frontend resolves names from `actorId`.

6. **Preserve game-specific UI NOTIFYs** if present (e.g. Love Letter's Baron card reveal). Those use `type: 'NOTIFY'` with their own payload shape (no `channel: 'log'`) — leave them alone. They flow through to the Board component separately.

## What events to emit

For each game, emit a log entry for every user-visible public event. Rough guide:

- **Every player move** (place stone, play card, roll dice, bet) → `logAction(playerID, 'log.xxx', {...})`
- **Round/turn boundaries** (deal, new round, shuffle) → `logSystem('log.xxx', {...})`
- **Game-ending events** (win, bust, elimination) → `logSystem('log.win', { actorId: winnerID })`

Don't over-emit — do NOT log every internal state transition or timer tick. Aim for "what a spectator would narrate."

## Step-by-step per game

1. Read `games/<id>/logic.ts` and `games/<id>/shared.ts` to understand the state and actions.
2. Read the existing `games/<id>/i18n/{zh,en}.json` — most games already have an empty `log: {}` placeholder you can fill.
3. Import the helpers:
   ```ts
   import { logAction, logSystem } from '@repo/shared';
   ```
4. In each `onAction` branch (and `onTimer` if applicable), append appropriate log events to the returned `events: [...]` array.
5. Add i18n keys for every `messageKey` you reference, in BOTH `zh.json` and `en.json`.
6. Add tests to `games/<id>/logic.test.ts`:
   ```ts
   it('emits log.xxx NOTIFY_ALL on <event>', () => {
     const h = createGame();
     h.action('Alice', { type: '...' });
     const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
     expect((notify as any).payload).toMatchObject({
       channel: 'log',
       messageKey: 'log.xxx',
       actorId: 'Alice',
     });
   });
   ```

## Validation (run these yourself before declaring done)

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck              # must be green
pnpm --filter @games/<id> test   # for each of your games
```

Also **end-to-end verify** at least one of your games via the CLI:

```bash
# Server is running on :3001. Get two bot tokens:
curl -s -X POST http://localhost:3001/api/admin/token -H "Content-Type: application/json" -d '{"name":"BotA"}'
curl -s -X POST http://localhost:3001/api/admin/token -H "Content-Type: application/json" -d '{"name":"BotB"}'

# Login as each (note HOME trick for per-bot CLI config):
cd packages/cli
HOME=/tmp/tc-a npx tsx src/index.ts login --server http://localhost:3001 --token <TOKEN_A>
HOME=/tmp/tc-b npx tsx src/index.ts login --server http://localhost:3001 --token <TOKEN_B>

# Play a short game:
HOME=/tmp/tc-a npx tsx src/index.ts rooms create <gameId>   # copy roomId
HOME=/tmp/tc-b npx tsx src/index.ts rooms join <roomId>
HOME=/tmp/tc-a npx tsx src/index.ts rooms start <roomId>
HOME=/tmp/tc-a npx tsx src/index.ts game action <roomId> '<action JSON>'

# Read back and inspect notifications:
HOME=/tmp/tc-a npx tsx src/index.ts game state <roomId>
# Look for `.data.notifications` array — should contain your log entries
# in contract shape: { channel: 'log', messageKey, actorId, ... }.
```

## Deliverable

A list of commits (or patches) that:
- modify only files in `games/<your-game>/`
- pass `pnpm typecheck` and all per-game tests
- demonstrate at least one game's notifications showing up in CLI `/state` output

## Out of scope (do NOT do these)

- Adding new helpers or types to shared/game-ui packages
- Modifying the ingestNotifications logic
- Adding log entries for other teams' games
- Refactoring game logic beyond adding NOTIFY events
- Adding persistence (DB writes) for log entries

## If you find a bug in the shared infrastructure

Surface it via commit message / PR description. Do NOT fix it — that's the orchestrator's job to coordinate across all workers.
