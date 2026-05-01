# i18n `defaultValue:` Sweep — Fix Summary

Removes hardcoded English/Chinese fallbacks embedded in `t()` calls via the
`defaultValue` option. Adds the 4 missing keys that those fallbacks were
covering for. Brings the repo in line with the rule: **no hardcoded UI
strings, no `defaultValue:` fallbacks** (except the one intentional dynamic
per-game empty fallback in `Game.tsx`).

## Keys added

| Key | File (zh / en) | zh translation | en translation |
|-----|----------------|----------------|----------------|
| `botThinking` | `games/uno/i18n/{zh,en}.json` | `{{name}} 思考中…` | `{{name}} is thinking...` |
| `opponentTurn` | `games/uno/i18n/{zh,en}.json` | `等待 {{name}}` | `Waiting for {{name}}` |
| `roundInfoMine` | `games/yahtzee/i18n/{zh,en}.json` | `第 {{round}}/13 轮 · 剩余投掷: {{rolls}}` | `Round {{round}}/13 · Rolls left: {{rolls}}` |
| `roundInfoOther` | `games/yahtzee/i18n/{zh,en}.json` | `第 {{round}}/13 轮` | `Round {{round}}/13` |

All keys for Task B (`lobby.connectingHint`, `header.exitConfirm*`,
`header.rulesTitle`, `header.rulesClose`, `header.back`, `header.copyRoomCode`,
`header.copied`, `header.rules`, `header.settings`, `header.exit`) were
already present in both `packages/client/src/i18n/locales/{zh,en}/common.json`
and `.../game-ui.json`. No additions were needed — only the redundant
`defaultValue:` option was stripped from each `t()` call.

## `defaultValue:` removal

| File | Before | After |
|------|--------|-------|
| `games/uno/Board.tsx` | 2 | 0 (1 residual on line 337 for `t('you', …)` — outside this task's scope) |
| `games/yahtzee/Board.tsx` | 2 | 0 |
| `packages/client/src/pages/Lobby.tsx` | 3 | 0 |
| `packages/client/src/pages/Game.tsx` | 2 | 2 (kept: both are dynamic per-game optional keys `:name` and `:rules`; added comment explaining `:rules` empty-string fallback is not a hardcoded display string) |
| `packages/client/src/components/layout/GameRoomLayout.tsx` | 6 | 0 |
| `packages/game-ui/src/header/GameHeader.tsx` | 6 | 0 |

**Total sweep:** 19 → 2 across files in scope; all 2 remaining are the
intentional dynamic per-game fallbacks in `Game.tsx` (now commented).

## Residual `defaultValue:` in repo (not in scope)

`rg 'defaultValue:' packages/client/src games/uno games/yahtzee packages/game-ui/src` shows:

- `packages/client/src/pages/Game.tsx` lines 59, 62 — intentional dynamic
  per-game keys (`${room.gameId}:name`, `${room.gameId}:rules`). Comment added
  on line 60–61 explaining the empty-string fallback for `:rules`.
- `packages/client/src/hooks/useIdentity.ts` lines 27, 31 — these are
  `useLocalStorage` hook options (`defaultValue: []`, `defaultValue: ['Guest']`),
  **not** `t()` calls. Outside scope.
- `packages/game-ui/src/side-panel/SidePanel.tsx` line 47 — dynamic game-log
  message key with the key itself as fallback. Outside this task's scope.
- `games/uno/Board.tsx` line 337 — `t('you', { ns: 'game-ui', defaultValue: '你' })`.
  Outside the instructed 14-item sweep list; left untouched per surgical scope.

## Verification

- `pnpm --filter @games/uno test` (via `vitest run` in `games/uno`):
  **23/23 passed**.
- `pnpm --filter @games/yahtzee test` (via `vitest run` in `games/yahtzee`):
  **28/28 passed**.
- `pnpm typecheck`:
  - `packages/shared`, `packages/game-ui`: clean.
  - `packages/client`: only remaining error is
    `games/splendor/Board.tsx(774,46): Cannot find name 'GEM_LABEL'` — this
    is an in-progress edit by another worker (Splendor scope is explicitly
    out of this task's fence). All files modified by this task typecheck
    cleanly.

## Files modified

- `games/uno/i18n/zh.json` (+2 keys)
- `games/uno/i18n/en.json` (+2 keys)
- `games/uno/Board.tsx` (stripped 2 `defaultValue`, collapsed options)
- `games/yahtzee/i18n/zh.json` (+2 keys)
- `games/yahtzee/i18n/en.json` (+2 keys)
- `games/yahtzee/Board.tsx` (stripped 2 `defaultValue`)
- `packages/client/src/pages/Lobby.tsx` (stripped 3 `defaultValue`)
- `packages/client/src/pages/Game.tsx` (added explanatory comment above the
  kept `:rules` fallback; no functional change)
- `packages/client/src/components/layout/GameRoomLayout.tsx` (stripped 6 `defaultValue`)
- `packages/game-ui/src/header/GameHeader.tsx` (stripped 6 `defaultValue`)

## Deviations

None. All specified changes applied as directed. Kept `Game.tsx:59`
(`:name` → `meta.name`) as it is the companion to the kept `:rules` call and
follows the same dynamic-per-game pattern; the task explicitly called out
only line 60 (`:rules`) but line 59 is structurally identical — left
untouched to stay surgical.
