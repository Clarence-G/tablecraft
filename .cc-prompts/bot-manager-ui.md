# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped frontend implementation task with complete spec below. Skip straight to execution — read files, make edits, verify. No clarifying questions, no companion offers.

# Parallel-worker note

You are running in parallel with a BACKEND worker who is editing `packages/server/**`, `packages/shared/**`, `packages/server/drizzle/**`, and `docs/ISSUE_bot-ownership.md`. They are adding bot-ownership HTTP APIs. Your scope is `packages/client/**` + reading the shared type they expose. If typecheck fails on your end because shared-types changed, read the new types and adapt YOUR code to fit — never `git stash` / `git reset` / `git checkout` anything you don't own.

# Task

Extend the TableCraft client with a Bot Manager section on the personal profile page (`packages/client/src/pages/Me.tsx`), and add a bot badge on the leaderboard. Logged-in users can create up to 5 bot tokens, view their list, copy a freshly-created token (shown ONCE), and revoke existing bots. Then give them instructions: "send this token to your agent with the tablecraft-dev-server skill to get started."

## Backend API contract (authored by parallel backend worker — do NOT modify it, consume it)

These endpoints WILL exist when your code runs. If they're not live yet during your implementation, you can still write the UI against the contract — backend worker is ahead.

```
GET /api/me/bots
  200 { ok: true, data: { bots: BotRow[], remaining: number } }
     BotRow: { userId: string; name: string; createdAt: string /* ISO */; lastUsedAt: string | null; revokedAt: string | null }
  401 UNAUTHORIZED → user must log in

POST /api/me/bots
  body: { name: string (1..40 chars) }
  201 { ok: true, data: { bot: BotRow, token: string } }   // token shown ONCE, never retrievable again
  400 INVALID_BODY
  409 BOT_LIMIT_REACHED

DELETE /api/me/bots/:botUserId
  200 { ok: true, data: { revoked: true } }
  403 NOT_OWNER
  404 NOT_FOUND

GET /api/me  — EXISTING endpoint, now ALSO returns `bots: BotRow[]` in the response (in addition to user/points/recentGames).
```

Leaderboard entries now carry new fields:
```
interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  isBot: boolean;           // NEW
  ownerName: string | null; // NEW: bot owner's display name, or null for humans / unowned bots
}
```

The shared type is exported from `packages/shared/src/types/leaderboard.ts` (location confirmed via `rg 'export interface LeaderboardEntry' packages/shared/`). If the type isn't in shared yet when you start, the backend worker's ISSUE doc will say where; or grep for it. DO NOT re-declare it client-side; import it from `@repo/shared` (or whatever the alias is — look at other imports from that package).

## Background (read first)

1. `/Users/bytedance/Projects/boardgames/packages/client/src/pages/Me.tsx` — full file.
2. `/Users/bytedance/Projects/boardgames/packages/client/src/pages/Leaderboard.tsx` — full file.
3. `/Users/bytedance/Projects/boardgames/packages/client/src/i18n/locales/zh/common.json` and `/Users/bytedance/Projects/boardgames/packages/client/src/i18n/locales/en/common.json` — for the i18n pattern.
4. `/Users/bytedance/Projects/boardgames/packages/client/src/lib/api.ts` — apiFetch signature and error shape. Figure out how to handle 401/409.
5. `/Users/bytedance/Projects/boardgames/packages/client/src/components/ui/button.tsx` and `dialog.tsx` — existing design system primitives. Use these.
6. `/Users/bytedance/Projects/boardgames/packages/client/src/components/ui/*` — any other primitive you might need (input, card, tooltip).
7. `/Users/bytedance/Projects/boardgames/DESIGN.md` if it exists — visual style guide ("warm skeuomorphic": cream background, thick brown borders, hard shadows).
8. `/Users/bytedance/Projects/boardgames/packages/client/src/components/PlayerAvatar.tsx` — existing identicon style, reuse or match vibe for bot avatars.

## Scope (files you may edit)

### New files
- `packages/client/src/components/BotManager.tsx` — the section component embedded into `Me.tsx`
- `packages/client/src/components/CreateBotDialog.tsx` — the create-bot modal with freshly-created token reveal (show-once with copy button)
- `packages/client/src/components/RevokeBotConfirm.tsx` — confirmation dialog for revoke (optional: inline confirm in BotManager works too)

### Modify
- `packages/client/src/pages/Me.tsx` — embed the `BotManager` component in a new section titled "Bots"
- `packages/client/src/pages/Leaderboard.tsx` — render bot rows with a small "🤖" badge + "by <ownerName>" subtitle. Use the new `isBot` / `ownerName` fields from the shared type.
- `packages/client/src/i18n/locales/zh/common.json`
- `packages/client/src/i18n/locales/en/common.json`

### Do NOT edit
- Anything under `packages/server/**`, `packages/shared/**`, `packages/game-ui/**`, `games/**`, `~/.hermes/**`
- Test infra — unless you're ADDING a client-side test for your new component (light touch, optional)

## Feature spec

### BotManager component (embedded in Me page)

Placement: Below the "Points by game" card on `Me.tsx`, before "Recent games". Wrap in the same warm-skeuomorphic card style (cream bg, thick brown border, hard shadow — match the existing cards on the page).

Content:
- Header: `t('me.bots.title')` = "我的 Bots" / "My Bots"
- Subtitle: `t('me.bots.remaining', {count: <number>})` = "剩余配额 {count} / 5" / "{count} / 5 remaining"
- Empty state when user has 0 bots: show a friendly card with a dice 🎲 icon and the CTA button `t('me.bots.createFirst')` = "创建你的第一个 Bot" / "Create your first bot"
- Non-empty: grid/list of bot cards. Each card shows:
  - Bot name (bold, primary size)
  - The bot's userId in a monospace caption (gray), with a copy icon to copy it
  - "创建于 <relative time>" / "Created <relative time>" using a simple relative-time util (or just `new Date().toLocaleDateString()`)
  - "最后使用: <relative time or "从未">" / "Last used: <relative or "never">" (from `lastUsedAt`)
  - A red "Revoke" button (with confirm dialog)
- Button at the top right / bottom: `t('me.bots.createNew')` = "创建新 Bot" / "Create new bot". When `remaining === 0`, disable it and show tooltip `t('me.bots.limitReached')` = "已达上限（最多 5 个）" / "Limit reached (max 5)"

### CreateBotDialog

A modal (Dialog primitive). Has:
- Title: `t('me.bots.createTitle')` = "创建 Bot" / "Create a bot"
- Input field for name, 1..40 chars. Placeholder: `t('me.bots.namePlaceholder')` = "给你的 Bot 起个名字" / "Give your bot a name"
- Cancel + Create buttons
- On Create click: `POST /api/me/bots` with `{ name }`. On 201: transition to the token-reveal view inside the same dialog. On 409 BOT_LIMIT_REACHED: show inline error. On 400: validation error.

Token-reveal view (after 201):
- Big headline: `t('me.bots.tokenReadyTitle')` = "Token 已生成！" / "Token generated!"
- Warning callout: `t('me.bots.tokenWarning')` = "⚠️ 此 Token 只会显示一次，关闭后无法再次查看。请立即复制并妥善保管。" / "⚠️ This token is shown only once. Copy it now — you cannot retrieve it later."
- The token in a monospace code block with a prominent Copy button
- Additional helper text explaining how to use it:
  ```
  将 token 发给你的 agent，配合 `tablecraft-dev-server` skill 即可开始使用。
  示例命令：
      export TABLECRAFT_TOKEN=<paste here>
      tablecraft games list
  ```
  In English: "Send this token to your agent with the `tablecraft-dev-server` skill. Example command: ..."
- Use `t('me.bots.tokenUsageHint')` — put the whole help block in one locale key with Markdown-safe line breaks, or split into multiple keys.
- A single "Done" button that closes the dialog and refreshes the bot list.

### Revoke

Confirmation dialog or inline confirm: "确定要吊销 Bot '<name>' 吗？此操作不可撤销，该 Bot 的现有 token 将立即失效。" / "Revoke bot '<name>'? This cannot be undone; the bot's token will stop working immediately." Buttons: Cancel + "吊销" / "Revoke" (destructive red).

On confirm: `DELETE /api/me/bots/:userId`. On 200: remove from list, update remaining. On 403/404: show error toast (use existing toast pattern if present, else an inline error message).

### Leaderboard badge

In `packages/client/src/pages/Leaderboard.tsx`:

Each row that has `entry.isBot === true` gets:
- A small 🤖 (or bot-shaped badge component) next to the name
- If `entry.ownerName` is non-null: underneath the name, a smaller caption `t('leaderboard.botBy', { name: entry.ownerName })` = "by {name}" / "由 {name} 创建"
- If `entry.ownerName` is null (unowned bot): caption `t('leaderboard.botUnowned')` = "匿名 Bot" / "Unowned bot"

Style: non-invasive — the bot gets the same row layout as humans. The badge + "by X" caption is the only difference. Test both light/dark appearances (if app has dark mode).

### Me page's `/api/me` response

The `MeApiResponse` interface on line 11 needs `bots?: BotRow[]` added (to match what the backend now returns). DO NOT fetch `/api/me/bots` separately for the first render — reuse the bots field from `/api/me`. Only re-fetch after create/revoke (or just push/splice locally, then refetch).

## Iron rules (strict — ALL apply)

1. **i18n strict**: every user-facing string goes through `t(key)`. Zero hardcoded Chinese/English. Every new key added to BOTH `locales/{zh,en}/common.json`. Verify with:
   ```bash
   rg '[\u4e00-\u9fff]+' packages/client/src --glob '!**/locales/**' --glob '!**/i18n/**' --glob '!*.test.*'
   ```
   New additions must be in locale files only, not in .tsx/.ts sources.

2. **NEVER use `t(key, { defaultValue: '...' })`** — no fallback default strings, even "safe English" ones. If the key is missing it's a bug; surface it.

3. **i18n parity**: zh and en must have identical key sets. After edits:
   ```bash
   node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json'); const e=require('./packages/client/src/i18n/locales/en/common.json'); const flatten=(o,p='')=>Object.keys(o).reduce((acc,k)=>{const kk=p?p+'.'+k:k; typeof o[k]==='object'&&o[k]!==null&&!Array.isArray(o[k])?Object.assign(acc,flatten(o[k],kk)):(acc[kk]=1); return acc;},{}); const zk=Object.keys(flatten(z)).sort(),ek=Object.keys(flatten(e)).sort(); const zOnly=zk.filter(k=>!ek.includes(k)), eOnly=ek.filter(k=>!zk.includes(k)); console.log('zh-only:',zOnly,'en-only:',eOnly);"
   ```
   Both arrays must be empty.

4. **Interpolation uses `{{n}}` not `{{count}}`** — `count` triggers i18next pluralization and yields broken strings like "1 / 5 remaining_one". Use `{{n}}` or any other non-reserved name. Example: `"remaining": "剩余配额 {{n}} / 5"`, `t('me.bots.remaining', { n: 3 })`.

5. **Match existing style** — use `Button` from `ui/button`, `Dialog` from `ui/dialog`, `Input` from `ui/input`. Don't introduce new primitives. Warm skeuomorphic palette (cream `bg-background` or `#f4e1b8`-ish, thick brown borders, hard shadows).

6. **No `any`** — type everything. Import `BotRow` / `LeaderboardEntry` from shared. If shared export doesn't exist yet, inline a type declaration in your new file with a TODO comment `// TODO: move to shared once backend worker lands` — but prefer importing.

7. **Typecheck is truth**: `pnpm typecheck` must be green before you report done.

8. **Don't touch server / games / shared TYPES** — the shared type for Leaderboard and BotRow is owned by the backend worker. You can READ it but not edit it.

9. **Don't commit / push / start dev server** — orchestrator handles those.

## Validation (run before reporting done)

```bash
cd /Users/bytedance/Projects/boardgames

# 1. Typecheck
pnpm --filter @repo/client typecheck
pnpm typecheck

# 2. i18n hardcode sweep (should be empty or near-empty, and NONE of your new files)
rg '[\u4e00-\u9fff]+' packages/client/src/components/BotManager.tsx packages/client/src/components/CreateBotDialog.tsx packages/client/src/pages/Me.tsx packages/client/src/pages/Leaderboard.tsx || echo "OK: no hardcoded CJK"

# 3. i18n parity (run inline via node, should print empty arrays)
node -e "const z=require('./packages/client/src/i18n/locales/zh/common.json'); const e=require('./packages/client/src/i18n/locales/en/common.json'); const flatten=(o,p='')=>Object.keys(o).reduce((acc,k)=>{const kk=p?p+'.'+k:k; typeof o[k]==='object'&&o[k]!==null&&!Array.isArray(o[k])?Object.assign(acc,flatten(o[k],kk)):(acc[kk]=1); return acc;},{}); const zk=Object.keys(flatten(z)).sort(),ek=Object.keys(flatten(e)).sort(); const zOnly=zk.filter(k=>!ek.includes(k)), eOnly=ek.filter(k=>!zk.includes(k)); console.log(JSON.stringify({zOnly, eOnly}));"

# 4. No defaultValue with CJK
rg "defaultValue.*[\u4e00-\u9fff]" packages/client/src/components/BotManager.tsx packages/client/src/components/CreateBotDialog.tsx packages/client/src/pages/Me.tsx packages/client/src/pages/Leaderboard.tsx || echo "OK: no defaultValue CJK leakage"

# 5. Build (optional but nice)
pnpm --filter @repo/client build || true
```

## Deliverable

Write `docs/ISSUE_bot-manager-ui.md` with:

1. Files edited (list)
2. New i18n keys added (list both zh and en blocks as JSON snippets)
3. Validation output (paste each command's output)
4. Screenshot commentary — do NOT run playwright yourself (orchestrator will do visual validation). Just note: "I expect the Bots card on Me.tsx to appear between Points-by-game and Recent-games" and similar.
5. Any prompt ambiguities you resolved via design choices
6. Known gaps handed to orchestrator: e.g. "contract between leaderboard type in shared and my import assumed filename X; if backend lands at Y I'll have a compile error to fix"
7. Deferred work: e.g. "a nicer token-copy success animation, relative time util (I used toLocaleDateString for now)"

START NOW.
