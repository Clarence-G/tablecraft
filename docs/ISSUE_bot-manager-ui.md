# Bot Manager UI — Frontend Implementation

## Files edited

### New
- `packages/client/src/components/BotManager.tsx` — the section embedded into Me page
- `packages/client/src/components/CreateBotDialog.tsx` — modal with form → token-reveal view
- `packages/client/src/components/RevokeBotConfirm.tsx` — confirm dialog for revoke

### Modified
- `packages/client/src/pages/Me.tsx` — imports `BotManager`, extends `MeApiResponse` with `bots?: BotRow[]`, renders `<BotManager initialBots={data?.bots ?? []} />` between "Points by game" and the sign-out section.
- `packages/client/src/pages/Leaderboard.tsx` — imports `LeaderboardEntry` from `@repo/shared` (dropped the local re-declaration), renders a `<Bot />` icon + `by <ownerName>` / `Unowned bot` caption beneath each row where `entry.isBot === true`.
- `packages/client/src/i18n/locales/en/common.json`
- `packages/client/src/i18n/locales/zh/common.json`

## New i18n keys

### English (`me.bots.*` + `leaderboard.botBy` / `leaderboard.botUnowned`)

```json
{
  "leaderboard": {
    "botBy": "by {{name}}",
    "botUnowned": "Unowned bot"
  },
  "me": {
    "bots": {
      "title": "My Bots",
      "remaining": "{{n}} / 5 remaining",
      "emptyHint": "Create a bot to let an AI agent play on your behalf.",
      "createFirst": "Create your first bot",
      "createNew": "Create new bot",
      "limitReached": "Limit reached (max 5)",
      "createTitle": "Create a bot",
      "nameLabel": "Bot name",
      "namePlaceholder": "Give your bot a name",
      "cancel": "Cancel",
      "create": "Create",
      "creating": "Creating...",
      "tokenReadyTitle": "Token generated!",
      "tokenWarning": "This token is shown only once. Copy it now — you cannot retrieve it later.",
      "tokenLabel": "Token",
      "copy": "Copy",
      "copied": "Copied",
      "copyUserId": "Copy bot ID",
      "tokenUsageHint": "Send this token to your agent with the `tablecraft-dev-server` skill to get started. Example:",
      "tokenUsageExample": "export TABLECRAFT_TOKEN=<paste here>\ntablecraft games list",
      "done": "Done",
      "createdAt": "Created {{date}}",
      "lastUsedAt": "Last used {{date}}",
      "lastUsedNever": "Last used: never",
      "revoke": "Revoke",
      "revoking": "Revoking...",
      "revokeTitle": "Revoke bot",
      "revokeConfirm": "Revoke bot '{{name}}'? This cannot be undone; the bot's token will stop working immediately.",
      "errorNameLength": "Name must be 1–40 characters.",
      "errorLimit": "Limit reached (max 5 bots).",
      "errorNotOwner": "You are not the owner of this bot.",
      "errorNotFound": "Bot not found.",
      "errorCopy": "Could not copy to clipboard.",
      "errorGeneric": "Something went wrong. Please try again."
    }
  }
}
```

### 中文

```json
{
  "leaderboard": {
    "botBy": "由 {{name}} 创建",
    "botUnowned": "匿名 Bot"
  },
  "me": {
    "bots": {
      "title": "我的 Bots",
      "remaining": "剩余配额 {{n}} / 5",
      "emptyHint": "创建一个 Bot，让 AI agent 代你参赛。",
      "createFirst": "创建你的第一个 Bot",
      "createNew": "创建新 Bot",
      "limitReached": "已达上限（最多 5 个）",
      "createTitle": "创建 Bot",
      "nameLabel": "Bot 名称",
      "namePlaceholder": "给你的 Bot 起个名字",
      "cancel": "取消",
      "create": "创建",
      "creating": "创建中...",
      "tokenReadyTitle": "Token 已生成！",
      "tokenWarning": "此 Token 只会显示一次，关闭后无法再次查看。请立即复制并妥善保管。",
      "tokenLabel": "Token",
      "copy": "复制",
      "copied": "已复制",
      "copyUserId": "复制 Bot ID",
      "tokenUsageHint": "将 token 发给你的 agent，配合 `tablecraft-dev-server` skill 即可开始使用。示例：",
      "tokenUsageExample": "export TABLECRAFT_TOKEN=<paste here>\ntablecraft games list",
      "done": "完成",
      "createdAt": "创建于 {{date}}",
      "lastUsedAt": "最后使用：{{date}}",
      "lastUsedNever": "最后使用：从未",
      "revoke": "吊销",
      "revoking": "吊销中...",
      "revokeTitle": "吊销 Bot",
      "revokeConfirm": "确定要吊销 Bot '{{name}}' 吗？此操作不可撤销，该 Bot 的现有 token 将立即失效。",
      "errorNameLength": "名称必须为 1-40 个字符。",
      "errorLimit": "已达上限（最多 5 个 Bot）。",
      "errorNotOwner": "你不是该 Bot 的所有者。",
      "errorNotFound": "未找到该 Bot。",
      "errorCopy": "无法复制到剪贴板。",
      "errorGeneric": "出了点问题，请重试。"
    }
  }
}
```

## Validation output

### 1. `pnpm typecheck`

```
> tablecraft@1.0.0 typecheck /Users/bytedance/Projects/boardgames
> tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/game-ui/tsconfig.json && tsc --noEmit -p packages/client/tsconfig.json
```

(clean exit, no errors)

### 2. i18n hardcode sweep over new/modified files

```
$ rg '[一-鿿]+' <new files + Me.tsx + Leaderboard.tsx>
OK: no hardcoded CJK
```

### 3. i18n parity

```
$ node -e "...flatten diff..."
{"zOnly":[],"eOnly":[]}
```

### 4. No `defaultValue` leakage

```
$ rg "defaultValue" <new files + Me.tsx + Leaderboard.tsx>
OK: no defaultValue
```

### 5. Build

`pnpm --filter @repo/client build` → `✓ built in 3.84s`

## Expected visual placement

- **Me page**: "My Bots" section appears between the "Points by game" list and the "Sign out" button. It uses the cream-card / 2px border / warm skeuomorphic primitives already used by other sections on the page. Empty state is a centered card with a `Dices` lucide icon and a "Create your first bot" button. Non-empty state is a list of rows, each row showing a circular Bot-icon avatar, name, monospace bot-userId with copy button, created/last-used dates, and a destructive Revoke button.
- **CreateBotDialog**: form view with name input; on success transitions to token-reveal view inside the same dialog showing a destructive-colored warning callout (AlertTriangle icon), the token in a selectable monospace block, a copy button (with Check icon feedback for 2s after copy), and a preformatted usage example showing the `TABLECRAFT_TOKEN` export + `tablecraft games list` invocation.
- **RevokeBotConfirm**: small dialog with message and a red "Revoke" destructive button.
- **Leaderboard**: rows that are bots get an inline caption (indented to align beneath the name) with a small `Bot` icon + "by {owner}" / "Unowned bot" caption. The primary `LeaderboardRow` layout is untouched.

## Design decisions / ambiguities I resolved

1. **Bot badge location in leaderboard**: the spec says "a small 🤖 next to the name + a caption underneath". The shared `LeaderboardRow` (in `@repo/game-ui`) is outside my edit scope and has no badge prop. Rather than fork or wrap with absolute positioning, I placed both the icon and the "by X" text together in a single caption line directly beneath the row, indented to the name column. The bot icon and the caption live together — this keeps the LeaderboardRow component untouched and gives a clean, non-invasive visual treatment. (Global rule "no emoji in code or docs" forced lucide `Bot` anyway.)
2. **Empty-state avatar**: used the `Dices` lucide icon (CLAUDE.md bans emoji); the spec said `🎲`.
3. **Bot avatar in list rows**: used the `Bot` lucide icon inside a cream-circle frame rather than identicon — clear signal that the row represents a bot, not a human.
4. **Copy feedback**: 2-second Check icon swap on copy, no toast system exists in the client (grep'd, nothing).
5. **Type for BotRow**: backend worker had not landed the shared export when I ran, so I declared `BotRow` locally in `BotManager.tsx` with a TODO comment and exported it so `Me.tsx` + `CreateBotDialog.tsx` consume the same type. `LeaderboardEntry` already existed in `@repo/shared` with `isBot` / `ownerName`, so I imported it and deleted the client-local re-declaration.
6. **`{{n}}` vs `{{count}}`**: used `{{n}}` for remaining as required (avoids i18next plural suffix).
7. **Revoke button mobile layout**: used `sr-only sm:not-sr-only` so the label shows on sm+ and icon-only on mobile — keeps the row compact at 375px.
8. **On revoke success**: locally filter the row out, then refetch `/api/me/bots` to re-sync `remaining`. On network hiccup we silently keep the local state rather than thrashing the user with errors.
9. **Reuse of `/api/me`**: per spec, we do NOT fetch `/api/me/bots` separately on first render. `Me.tsx` passes `data.bots ?? []` as `initialBots` to `BotManager`, which then refetches only after create/revoke. `BotManager` only renders once `loading === false`, so the initial list is always consistent with whatever `/api/me` returned.

## Known gaps / handed to orchestrator

1. **BotRow type**: I inlined it in `BotManager.tsx` with a TODO because the backend worker's shared export was not present when I ran. If backend lands the shared `BotRow` export later, a 2-line change (delete local `BotRow`, import from `@repo/shared`) closes it; existing consumers already import it from `'./BotManager'` which keeps churn local.
2. **Contract assumption: `POST /api/me/bots` returns `{ bot: BotRow, token: string }`** — I typed the success body accordingly (`CreateResponse`). If backend returns a different shape, I'll get a clear TS error at the call site.
3. **Contract assumption: `GET /api/me` now carries `bots?: BotRow[]`** — typed as optional so pre-backend-landing requests that omit the field still compile and render an empty list.
4. **No orchestrator screenshot validation yet**: per task instructions, I did not run Playwright. Orchestrator should visually confirm: (a) Me page — Bots section renders between "Points by game" and "Sign out"; (b) create-dialog token-reveal view; (c) leaderboard with a bot row showing the sub-caption.

## Deferred work

- **Relative-time util** — I used `toLocaleDateString('zh-CN' | 'en-US')` for createdAt / lastUsedAt. Spec mentioned "relative time" as a nice-to-have; a proper `formatDistanceToNow`-style helper can be swapped in without changing the call signature.
- **Toast for errors** — no toast system exists in the client; inline `role="alert"` text handles the rare 403 / 404 / clipboard paths. A future toast pattern can replace these.
- **Copy success animation** — simple icon swap; a richer micro-interaction (slide-in confirmation, etc.) is deferred.
- **Client-side tests** — not added (optional per task). The components are thin integrations over `apiFetch`; most value would come from a Playwright flow, which orchestrator owns.
