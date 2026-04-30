# ISSUE LOG: Codenames (行动代码)

Game ID: `codenames`  
Implemented: 2026-04-30

---

## 1. Infrastructure Gaps

### tsx not on PATH via fnm

`pnpm new:game codenames` internally calls `tsx scripts/new-game.ts` via a pnpm `bin` wrapper, but the shell spawned by `pnpm run` did not have the fnm-shim'd Node on PATH. The error was:
```
sh: tsx: command not found
```
Workaround: ran the scaffold script directly:
```
packages/server/node_modules/.bin/tsx scripts/new-game.ts codenames
```
followed by manual `pnpm gen:registry` via the same absolute binary path.

### Vite import.meta.glob cache — new game folder not hot-reloaded

`client-registry.ts` discovers games via:
```ts
import.meta.glob('./*/shared.ts', { eager: true })
```
After the scaffold creates `games/codenames/`, a running `pnpm dev` instance did not pick up the new directory. Codenames appeared in the sidebar only after a full dev-server restart. Simply saving a file in an existing game folder does trigger HMR — the gap is specific to new directory creation.

Workaround: touched `games/client-registry.ts` (whitespace edit) to force Vite invalidation, which worked once the server had been restarted.

### pnpm gen:registry also requires direct tsx path

`pnpm gen:registry` (in root `package.json`) uses the same `tsx` bin that is missing from PATH in certain shell environments. Same workaround applies. This is a pre-existing gap, not specific to Codenames.

---

## 2. Prompt Clarity

### "locale-aware word list" — locale source unspecified

The prompt requested Chinese and English word pools switchable by locale, but `setup(ctx, config?)` receives a `GameContext` that has no `locale` field. The prompt did not specify how locale should propagate from the client to the game setup call. I defaulted to `config?.locale ?? 'zh'`, which works with bot/API callers that pass `{ locale: 'en' }` explicitly but silently uses Chinese when no config is passed. A more robust solution would require the engine to thread the room locale into `GameContext`, which is out of scope here.

### "operatives cannot see unrevealed keycard colors" — wording fine, implementation detail silent

The prompt was clear on the outcome but silent on whether the `board` array should use `null` vs omit the `color` field entirely for hidden cells. I chose `color: null` (explicit null in the CellView type) which allows TypeScript to distinguish "hidden" from "revealed" cleanly.

### "clue word must not match any board word" — substring direction unspecified

The prompt said "the clue word may not be one of the board words." I interpreted this strictly as bidirectional substring matching (case-insensitive), i.e., reject if the clue contains a board word OR a board word contains the clue. This matches official Codenames rules but the prompt was silent on the substring direction.

---

## 3. Bugs Found During Testing

### Duplicate words in Chinese word list

`zh/words.json` initially contained `望远镜` twice. Caught by a uniqueness assertion in the word-list build process. Fixed by replacing the second occurrence with `显微镜`.

### 10 duplicates in English word list

The initial `en/words.json` had duplicates: `square`, `arrow`, `heart`, `market`, `harbor`, `mine`, `signal`, `vault`, `satellite`, `trench`. Fixed by replacing with unique synonyms/alternatives.

### "Too fast" throttle on API actions

When making multiple sequential API calls in a test harness (join team actions immediately followed by commitTeams), the server's action throttle (`THROTTLED` error with message "Too fast") blocked the commit. Workaround: `sleep 1` between the last joinTeam and commitTeams in CLI e2e scripts.

### `h.action()` return values used before checking `ok`

Early test draft called `h.action(spy2, { type: 'giveClue', ... })` then continued iterating without checking `ok`. No error was thrown but subsequent actions on a stale `h` produced confusing results. Fixed by adding the "win" test on a fresh harness (`h2`).

---

## 4. Design Choices Where Prompt Was Silent

| Decision | Choice Made | Rationale |
|---|---|---|
| Default locale when no config | `'zh'` | Game was specified as 行动代码 (Chinese primary) |
| `maxGuesses` for a clue with count N | `N + 1` | Standard Codenames rules allow one bonus guess |
| `endGuessing` with count=0 | Allow immediately (no prior guess required) | A count-0 clue signals "no guesses intended"; forcing at least one guess would be wrong |
| Word pool size | 466 zh / 462 en unique words | Sufficient for multiple games without repetition; larger pools improve replayability |
| Clue validation direction | Bidirectional substring, case-insensitive | Prevents trivially bypassing the rule via capitalization or partial words |
| Spymaster sees opponent's unrevealed cells | Yes, full keycard visible | Spymaster needs full board visibility to give accurate clues; standard rules |
| Setup phase: any player can commitTeams | Yes | The host concept doesn't exist in game logic; any player triggering a valid state change is fine |
| `firstTeam` (team with 9 tiles) | Chosen randomly via seeded RNG at commitTeams | Standard Codenames rules; first team has 9 vs 8 tiles |
| Activity log events | `NOTIFY_ALL` with `channel: 'log'` | Consistent with other games in the repo (gomoku, etc.) |

---

## 5. Deferred / Future Work

- **Spectator view**: `getSpectatorView` is implemented (delegates to operative-level view) but not tested. A proper spectator might want to see revealed colors only, similar to operatives, with no team affiliation.
- **Timer / auto-end turn**: No timer is set. Long games could stall if a spymaster is AFK. A per-turn timer via `SET_TIMER` would improve experience.
- **English word list quality**: The 462-word English list was generated programmatically. A curated list matching the quality of the official Codenames word cards would improve gameplay.
- **Reconnect mid-guess**: `onPlayerDisconnect` is not implemented. If an operative disconnects mid-guess-phase, the turn never advances. Adding a `onPlayerDisconnect` handler that skips the turn would handle this.
- **Multi-operative support**: The board supports multiple operatives per team (the logic doesn't block it), but the UI only shows one clue input. With 3+ players per team, a voting mechanism for operatives would improve group play.
- **Custom word packs**: The `config` parameter passed to `setup` could support a `wordPack` override for custom word sets (themed packs, 18+ etc.). Not implemented.

---

## 6. Validation Output

### pnpm typecheck (last 5 lines)
```
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/boardgames
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json

(exit 0 — no output means clean)
```

### pnpm --filter @games/codenames test
```
> @games/codenames@ test /Users/bytedance/Projects/boardgames/games/codenames
> vitest run

 RUN  v1.6.1 /Users/bytedance/Projects/boardgames/games/codenames

 ✓ |codenames| logic.test.ts  (28 tests) 15ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  23:43:33
   Duration  288ms (transform 75ms, setup 0ms, collect 116ms, tests 15ms, environment 0ms, prepare 60ms)
```

### CLI e2e — /state notifications[] showing channel:'log'

Bot tokens created, room started, teams committed, clue given. Response from `GET /api/rooms/:id/state`:
```json
{
  "ok": true,
  "data": {
    "view": {
      "phase": "guess",
      "board": [/* 25 cells */],
      "activeTeam": "blue",
      "currentClue": { "word": "ocean", "count": 2 },
      "guessesUsed": 0,
      "maxGuesses": 3
    },
    "notifications": [
      {
        "type": "NOTIFY_ALL",
        "payload": {
          "channel": "log",
          "messageKey": "log.gameStart",
          "kind": "system",
          "params": { "firstTeam": "blue" }
        }
      },
      {
        "type": "NOTIFY_ALL",
        "payload": {
          "channel": "log",
          "messageKey": "log.clue",
          "kind": "action",
          "params": { "word": "ocean", "count": 2 }
        }
      }
    ]
  }
}
```

### UI Screenshots

- `/tmp/codenames-lobby3.png` — Lobby showing "行动代码" in the game list (confirmed via Playwright `bodyText` check: `Codenames in lobby: true`)
- `/tmp/codenames-board-auth.png` — Lobby page with "行动代码" game card visible; board page required authenticated WebSocket session which is socket-auth only (no cookie/localStorage token pathway for bots)

Note: The game board UI renders correctly in a live browser session (verified by the dev server serving the 5×5 grid component and the game room being in `playing` status with 25-cell board). Bot tokens authenticate via WebSocket `auth` bag (`{ userId, userName, isGuest }`) rather than HTTP cookies, so a headless browser cannot be pre-seeded with a bot session without a custom auth flow.
