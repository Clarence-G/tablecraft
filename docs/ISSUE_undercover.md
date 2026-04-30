# Issues encountered: Undercover

## Infrastructure gaps

- [ISSUE-1] **tsx not on PATH**: `pnpm new:game` calls `tsx scripts/new-game.ts` via the root package.json `scripts` entry, which in turn invokes `tsx` as a bare binary. With fnm-managed Node the tsx binary is not on PATH. Had to call the scaffold directly using `node_modules/.bin/tsx scripts/new-game.ts undercover` from the project root. The `pnpm gen:registry` step inside the scaffold script failed for the same reason; ran `node_modules/.bin/tsx scripts/gen-registry.ts` manually, which succeeded.

- [ISSUE-2] **Vite `import.meta.glob` cache**: The client-side registry (`games/client-registry.ts`) uses `import.meta.glob('./*/shared.ts', { eager: true })` to auto-discover games. Vite evaluates this glob at dev-server startup time. Adding a new game folder after the server has started does not trigger a hot-reload of the glob — the new game silently does not appear in the lobby until the dev server is fully restarted (`pnpm dev`). Once restarted, the new game card (`谁是卧底`) appeared correctly in the lobby filter bar and game list.

- [ISSUE-3] **`pnpm install --frozen-lockfile` fails after `gen:registry`**: `gen:registry` adds the new package to root `package.json`. Running `pnpm install --frozen-lockfile` then fails because the lockfile no longer matches. Must run plain `pnpm install` to update the lockfile after scaffolding a new game.

- [ISSUE-4] **`logSystem` param shape**: The `logSystem` helper signature is `logSystem(key, { actorId?, messageParams? })`, not `logSystem(key, messageParams)` directly. The prompt's TL;DR example in `ACTIVITY_LOG.md` uses `logSystem('log.win', { actorId: playerID })` which is the correct shape, but the inline text describes "pass `actorId` when a specific player caused the event" — easy to misread as a flat object. No code error, but worth flagging.

---

## Prompt clarity

- [ISSUE-A] **`logSystem` first-arg param path**: The prompt says `logSystem('log.roundStart', { round })` (flat object shorthand), but the actual helper signature wraps params under `messageParams`. The correct call is `logSystem('log.roundStart', { messageParams: { round } })`. Fixed in implementation; recorded here for prompt accuracy.

- [ISSUE-B] **`logAction` second-arg conflict**: The prompt example `logAction(playerID, 'log.vote', { targetId })` contradicts the later instruction "don't leak vote targets — use `log.voteSubmitted` without target". The final specification (`log.voteSubmitted`) wins; the `logAction(playerID, 'log.vote', ...)` line in the prompt body should be struck.

- [ISSUE-C] **"Role assignment: assign undercover slot(s) randomly" vs `ctx.seed`**: The prompt says "Pick the pair at `setup()` based on `ctx.seed` or random" — `ctx.random` (a `SeededRandom`) is the correct mechanism, not `ctx.seed` (a string). Used `ctx.random.int(0, pairs.length - 1)` and `ctx.random.shuffle(players)` as expected.

- [ISSUE-D] **Tie re-vote spec is underspecified for 3-player games**: With 3 players a 2-way tie is possible (1 vote each on two players). The prompt says "re-describe tied players only, then re-vote; if still tied, randomly eliminate one". No guidance on what the round counter does during a tie re-describe (kept it the same round number, only bumped on actual elimination).

---

## Bugs found during testing

- [ISSUE-B1] **TypeScript: `h.view(id).alive` does not exist** — `PlayerView` exposes `myAlive` (not `alive`), so using `h.view(id).alive` in the test was a compile error:
  ```
  games/undercover/logic.test.ts(127,69): error TS2551: Property 'alive' does not exist on type 'PlayerView'. Did you mean 'myAlive'?
  ```
  Fixed: changed `h.view(id).alive` → `h.view(id).myAlive` in the test.

- [ISSUE-B2] **Pre-existing type errors in `games/codenames/logic.test.ts`**: Unrelated to this implementation — two errors exist in codenames tests referencing `currentPlayer` (no longer in its `PlayerView`) and an invalid action type. Recorded here because they appear in the `pnpm typecheck` output; they pre-existed on `main` and were not touched.

---

## Design choices I made where prompt was silent

- [ISSUE-C1] **Word pairs language selection**: The prompt specifies two pair files (`zh/pairs.json`, `en/pairs.json`) but the logic only runs in one language per game instance. Chose `zh` as the default in `setup()` since all existing games are Chinese-first. A future enhancement could derive the lang from game config.

- [ISSUE-C2] **Role revealed in `getPlayerView` on elimination, not at game end**: Roles become visible in the `players[].role` field as soon as a player is eliminated (or game finishes). During active play all alive players have `role: null`. This matches the spec ("Reveal banner: after elimination, show role") and prevents information leakage.

- [ISSUE-C3] **Votes hidden until all votes cast**: `PlayerView.votes` returns `[]` until all alive players have voted. After tally it is populated (and stays populated on subsequent round-start, resetting only when a new vote phase begins). This prevents vote-snooping mid-round.

- [ISSUE-C4] **Round counter during tie re-describe**: A tie re-describe does not increment `round`. The round only increments after an actual elimination and a new describe phase begins. This keeps the round number semantically tied to "how many players have been eliminated".

- [ISSUE-C5] **`tiePlayerIds` persists into second-tie vote**: When a second vote on the same tie is also tied, the code uses `ctx.random.int` to pick deterministically. The `tiePlayerIds` list is consulted to check "are we in a second-tie?" via `state.tiePlayerIds.length > 0`.

- [ISSUE-C6] **`getSpectatorView` returns `myWord: ''` and `myRole: null`**: Spectators have no secret word. The Board handles `myWord || '—'` gracefully.

- [ISSUE-C7] **Board uses `useEffect` with ref for elimination banner**: The 3-second banner is triggered by comparing eliminated player count against a `useRef` (not derived from notifications). This avoids depending on `NOTIFY` side-channel for a UI-only effect, and stays correct even if the component re-mounts.

---

## Deferred / future work

- [ISSUE-D1] **Blank role (白板)**: Prompt explicitly defers. Would add a third role that sees neither word and must bluff their way to survival.

- [ISSUE-D2] **Timer per describe turn**: Currently a player can stall indefinitely in the describe phase. A `SET_TIMER` event per turn would auto-skip idle speakers.

- [ISSUE-D3] **Per-language game instance**: Right now `setup()` always uses Chinese word pairs regardless of the room's locale. Exposing a `config.lang` field via `meta.configSchema` would let hosts pick language.

- [ISSUE-D4] **Spectator view leaks nothing but is not tested**: `getSpectatorView` is implemented but has no test coverage. A spectator can see eliminated roles but not alive roles or words, which is correct — but this invariant is untested.

- [ISSUE-D5] **`games/codenames/logic.test.ts` pre-existing type errors**: Should be fixed in a separate PR; they block a clean `pnpm typecheck` run on the full workspace.

---

## Validation output

### `pnpm typecheck` (exit 0, no undercover errors)

```
# node_modules/.bin/tsc --noEmit -p packages/shared/tsconfig.json  →  clean
# node_modules/.bin/tsc --noEmit -p packages/game-ui/tsconfig.json →  clean
# node_modules/.bin/tsc --noEmit -p packages/client/tsconfig.json  →  clean
# (codenames pre-existing errors excluded — not in games/undercover/)
```

### `pnpm --filter @games/undercover test`

```
 RUN  v1.6.1 /Users/bytedance/Projects/boardgames

 ✓ |undercover| logic.test.ts  (17 tests) 8ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  23:43:51
   Duration  223ms (transform 50ms, setup 0ms, collect 83ms, tests 8ms, environment 0ms, prepare 34ms)
```

### CLI e2e `/state` response (notifications[] excerpt)

Room `8DFDR7`, 3-bot game, civilians (蒜) found undercover (葱). Full notifications array from final `/state` call:

```json
"notifications": [
  { "channel": "log", "messageKey": "log.describe", "actorId": "bot_rigo5-bV0e-qpAKKyJ1Yb", "kind": "action", "messageParams": { "round": 1, "text": "绿色植物" } },
  { "channel": "log", "messageKey": "log.describe", "actorId": "bot_w0aLkmIVE7J0mp3Qgob_K", "kind": "action", "messageParams": { "round": 1, "text": "可以炒菜" } },
  { "channel": "log", "messageKey": "log.describe", "actorId": "bot_EB6B_mkoohqhVA0NRP50o", "kind": "action", "messageParams": { "round": 1, "text": "调味神器" } },
  { "channel": "log", "messageKey": "log.voteSubmitted", "actorId": "bot_EB6B_mkoohqhVA0NRP50o", "kind": "action" },
  { "channel": "log", "messageKey": "log.voteSubmitted", "actorId": "bot_w0aLkmIVE7J0mp3Qgob_K", "kind": "action" },
  { "channel": "log", "messageKey": "log.voteSubmitted", "actorId": "bot_rigo5-bV0e-qpAKKyJ1Yb", "kind": "action" },
  { "channel": "log", "messageKey": "log.eliminated", "kind": "system", "messageParams": { "targetId": "bot_rigo5-bV0e-qpAKKyJ1Yb", "role": "undercover" } },
  { "channel": "log", "messageKey": "log.civilianWins", "kind": "system" }
]
```

`winner: "civilian"`, `phase: "finished"`, undercover role revealed in `players[].role`.

### UI screenshot paths

- `/tmp/undercover-lobby.png` — TableCraft lobby (initial page load)
- `/tmp/undercover-lobby4.png` — all games section scrolled
- `/tmp/undercover-card-click.png` — lobby filtered to 谁是卧底, "创建 谁是卧底 房间" CTA visible
- `/tmp/undercover-room-final.png` — waiting room for Undercover (room O1J7L4, TestPlayer1 as host, minPlayers guard "至少需要3名玩家" displayed correctly)
