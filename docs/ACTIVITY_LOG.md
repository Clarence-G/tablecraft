# Activity Log — Contract for Game Authors

The **in-game Activity Log** (right side panel "Log" tab) is a shared feature
across every game. It shows a timeline of public events ("Alice placed a
stone at (8, 8)", "Bob drew 2 cards", "Round 3 ended").

If you are adding or updating a game, **you are responsible for emitting
log entries from your `logic.ts`** so the SidePanel has something to show.

## TL;DR

```ts
import { logAction, logSystem } from '@repo/shared';

events: [
  logAction(playerID, 'log.move', { row: 7, col: 7 }),
  logSystem('log.win', { actorId: playerID }),
  { type: 'END_GAME', rankings: [playerID, loser] },
]
```

Plus one i18n key per `messageKey` in `games/<id>/i18n/{zh,en}.json`:

```jsonc
{ "log": { "move": "在 ({{row}}, {{col}}) 落子", "win": "获胜！" } }
```

That's it.

---

## Architecture

Two separate channels share the `NOTIFY` / `NOTIFY_ALL` transport:

```
┌─────────────────┐           ┌──────────────────────┐
│  channel: 'log' │──────────▶│  SidePanel Log tab   │  ← you want this
└─────────────────┘           └──────────────────────┘
┌─────────────────┐           ┌──────────────────────┐
│  no channel,    │──────────▶│  Board component's   │  ← game-specific
│  or anything    │           │  notifications prop  │    (e.g. card reveals)
│  else           │           └──────────────────────┘
└─────────────────┘
```

- **`channel: 'log'` payloads** are ingested by `GameLogProvider` and rendered
  as `LogEntry` rows in the SidePanel. They must include an `messageKey`
  that resolves against the game's i18n namespace.
- **Any other payload** flows through to the Board component untouched,
  for game-specific uses (e.g. Love Letter's Baron telling a player what
  card their opponent held). The SidePanel ignores these.

## Pipeline

```
games/<id>/logic.ts
  └─ onAction() returns { events: [logAction(...), logSystem(...), ...] }
      └─ GameRoom.processEvents → socket.emit('game:notify', payload)
          └─ useGame store appends to `notifications[]`
              └─ Game.tsx → <NotificationBridge> → ingestNotifications()
                  └─ GameLogProvider filters channel === 'log'
                      └─ SidePanel LogList renders LogEntry
```

## Helpers (preferred)

Always prefer `logAction` / `logSystem` / `logPrivate` over hand-authoring
`NOTIFY_ALL` events. They produce correctly tagged `{ channel: 'log', ... }`
payloads, so you can't accidentally forget `channel: 'log'` or `messageKey`.

| Helper | When to use |
|---|---|
| `logAction(actorId, key, params?)` | A player did something: "Alice played the 5 of Hearts" |
| `logSystem(key, { actorId?, params? })` | Something happened (round ended, timer fired, game ended) |
| `logPrivate(to, key, { actorId?, params? })` | Only one player should see it (private info reveal) |

## Rules for messageKey and params

1. **`messageKey` must resolve** against the per-game i18n namespace
   (`games/<id>/i18n/{zh,en}.json`). Flat keys like `"log.move"`,
   `"log.win"` are preferred.
2. **Pass player identity via `actorId`**, never hardcode player names
   into `messageParams`. The SidePanel looks up the display name from
   `actorId` so it stays fresh if a user renames.
3. **Emit logs after validation** but **before** `END_GAME`. The final
   "Alice wins!" NOTIFY_ALL is the last entry before the END_GAME event.
4. Use **`logAction` for attributed player events**, **`logSystem` for
   neutral events** (round start, timer, game end). The `kind` affects
   how the SidePanel styles the row (action = indented, system = centered).

## Full worked example (gomoku)

```ts
// games/gomoku/logic.ts
import { logAction, logSystem } from '@repo/shared';

onAction(state, action, playerID): ActionResult<GomokuState> {
  // ... validate ...
  const stone = stoneOf(state.players, playerID);
  // ... place stone, check win ...

  const moveLog = logAction(
    playerID,
    stone === 'black' ? 'log.moveBlack' : 'log.moveWhite',
    { row: row + 1, col: col + 1 },
  );

  if (won) {
    return {
      ok: true,
      state: newState,
      events: [
        moveLog,
        logSystem('log.win', { actorId: playerID }),
        { type: 'END_GAME', rankings: [playerID, loser] },
      ],
    };
  }

  return { ok: true, state: newState, events: [moveLog] };
}
```

```jsonc
// games/gomoku/i18n/zh.json
{
  "log": {
    "moveBlack": "落下黑子 ({{row}}, {{col}})",
    "moveWhite": "落下白子 ({{row}}, {{col}})",
    "win": "连成五子,获胜!"
  }
}
```

```jsonc
// games/gomoku/i18n/en.json
{
  "log": {
    "moveBlack": "played Black at ({{row}}, {{col}})",
    "moveWhite": "played White at ({{row}}, {{col}})",
    "win": "connected five — wins!"
  }
}
```

The SidePanel renders "playerX played Black at (8, 8)" on the log row,
with the player name resolved from `actorId` at render time.

## Testing

Every game's `logic.test.ts` should include at least one assertion checking
the emitted events. The `GameTestHarness` exposes `lastEvents` for exactly this:

```ts
it('emits a log.move NOTIFY_ALL on placement', () => {
  const h = createGame();
  h.action('Alice', { type: 'place', row: 7, col: 7 });
  const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
  expect((notify as any).payload).toMatchObject({
    channel: 'log',
    messageKey: 'log.moveBlack',
    actorId: 'Alice',
    kind: 'action',
  });
});
```

## Common mistakes

| ❌ Don't | ✅ Do |
|---|---|
| `payload: { type: 'xxx', message: '中文...' }` | `logAction(pid, 'log.xxx', {...})` |
| `messageParams: { name: 'Alice' }` | `actorId: 'Alice'` — SidePanel resolves name |
| Putting log keys in `packages/client/src/i18n/locales/*/common.json` | Put them in `games/<id>/i18n/{zh,en}.json` under a `log:` object |
| Emitting 1 NOTIFY per timer tick | Only emit events users want to see |
| Adding a new `LogEntryKind` | Stick with the 3 existing ones: `action`/`system`/`info` |
