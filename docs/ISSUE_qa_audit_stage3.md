# QA audit — Stage 3 (Lobby redesign + brand rename + Stage 1.5/2/3 landings)

Auditor: Claude (Opus 4.7) · 2026-05-01 · report-only, no code edits.

Screenshots: `tmp/qa-shots/1777626730181/`
Scripts: `tmp/qa-script.ts`, `tmp/qa-overflow.ts`, `tmp/qa-desktop-overflow.ts`

## Summary

- **0 P0** (nothing is broken or crashing)
- **2 P1** (desktop + mobile horizontal scroll in Lobby — both reproducible with overflow-probe scripts)
- **7 P2** (doc drift from brand rename, stale Stage-2 issue doc, tag colors missing, stale dist bundle, misc.)
- **3 P3** (nits, R6 router warnings, i18n key-name asymmetry)

Dev server note: on start the orchestrator-promised dev server was NOT running on 3001/5173 (`curl: Failed to connect`). I started it with `pnpm dev` (background PID logged to `tmp/dev.log`) and audited against that instance. Flagging so orchestrator knows the "dev server: RUNNING" precondition was not met.

---

## P0 — broken / unusable

*(none)*

---

## P1 — bugs users will notice

### P1-1. Horizontal scrollbar on desktop Lobby in English locale

- **What I saw.** At 1440×900 viewport, `document.body.scrollWidth = 1481` (41 px past viewport) as soon as locale flips to English. `zh` locale is clean (`bsw=1440`). Screenshot: `06-lobby-en-desktop.png` (the screenshot itself is 1481 px wide, because Playwright captured full body scroll width).
- **Root cause.** `LobbySidePanel` tab strip has 4 `TabButton`s with `text-xs gap-1 px-2 py-1.5`. English labels `Ranks / Friends / Profile / Recent` (`lobbyPanel.tab.*` + `lobbyPanel.friends.tabLabel`) are wide enough that the 4 pills + icons don't fit into the `w-72 lg:w-80` sidebar. The rightmost button (`Recent`) ends at x=1457, and the panel collapse button at x=1481, pushing the whole page horizontally.
- **Evidence.** `tmp/qa-desktop-overflow.ts` output:
  ```
  === lang=en ===
  { "bsw": 1481, "bcw": 1440,
    "suspects": [
      { "t":"BUTTON","txt":"Recent","l":1379,"rt":1457,"w":78 },
      { "t":"BUTTON","l":1463,"rt":1481,"w":18 },   // collapse button
      ...
    ]
  }
  === lang=zh ===
  { "bsw": 1440, "bcw": 1440, "suspects": [] }
  ```
- **Repro.** `localStorage.setItem('tablecraft:locale','en'); location.reload()` → observe horizontal scrollbar at bottom of viewport; also visible on any desktop ≤ 1480 px.
- **File.** `packages/client/src/components/layout/LobbySidePanel.tsx:906` (`w-72 lg:w-80`) and tab strip starting around line 852.

### P1-2. Horizontal scrollbar on mobile Lobby (all locales)

- **What I saw.** At 375×812 viewport, `body.scrollWidth = 382` — 7 px past viewport. Screenshot `01-lobby-mobile.png` is captured at 382 px wide. Produces a visible horizontal scroll/rubber-band on mobile. Tested under zh, reproduces the same way in en.
- **Root cause.** The Active-rooms `SectionHead` (`packages/game-ui/src/section/SectionHead.tsx`) renders three flex children:
  1. `<h3 shrink-0>` title ("进行中的房间")
  2. actions slot = `QuickJoinBar` (input + button, wide)
  3. "查看全部 →" link with `shrink-0`
  With both `shrink-0` title and `shrink-0` view-all link plus a wide QuickJoinBar, the row blows past the 343 px content box inside `max-w-3xl px-4`. The "查看全部" button ends at exactly x=382.
- **Evidence.** `tmp/qa-overflow.ts` output at 375 px:
  ```
  "bodyScrollWidth": 382, "bodyClientWidth": 375
  suspects[0]: BUTTON "inline-flex ... text-muted-foreground" left=310 right=382 w=72
    parents: DIV.flex items-center gap-3 min-w-0 → DIV.flex items-center justify-between gap-3 mb-3 → SECTION.scroll-mt-20
  ```
- **Files.** `packages/client/src/pages/Lobby.tsx:245` (SectionHead with `actions={<QuickJoinBar />}`), `packages/game-ui/src/section/SectionHead.tsx:30-45` (right group).

---

## P2 — bugs or polish that users will notice but not be blocked by

### P2-1. `docs/DESIGN.md` / `docs/LAYOUT.md` / `docs/UX_POLISH.md` all say "Tabletop Games Platform" in H1 (pre-rename)

- `docs/DESIGN.md:1` — `# DESIGN.md -- Tabletop Games Platform`
- `docs/DESIGN.md:104` — table example still says `"Tabletop Games" in nav` as the page-title role, but nav now renders `TableCraft`.
- `docs/LAYOUT.md:1` — `# LAYOUT.md -- Tabletop Games Platform`. Body at line ~63 correctly mentions "TableCraft logo" in the header diagram, so the header is internally inconsistent with the diagram.
- `docs/UX_POLISH.md:1` — same pre-rename title.

`docs/DEVELOPMENT.md` is already updated to `TableCraft`; the three above were missed by the rename sweep.

### P2-2. `docs/ISSUE_STAGE_2_REMAINING.md` is stale

- Lists "friend-request-flow: Alice unfriends Bob but Bob's row doesn't disappear" and "friend-request-rejection: outgoingHeader doesn't re-appear" as current-state real-app bugs.
- Both have since been fixed/explained in `docs/ISSUE_appfix_friends.md` (commit `931c848`): bug 1 = DELETE envelope mismatch, fixed server-side; bug 2 = strict-match test bug, fixed test-side. The Stage 2 doc's "Real application bugs" section should be marked resolved or removed.

### P2-3. Stale prebuilt client bundle has old Chinese brand baked in

- `packages/client/dist/assets/index-CHs2YcFT.js` still contains `zee={title:"桌游大全",slogan:"和朋友一起，随时随地玩桌游"}` (old brand in zh common namespace).
- Source (`packages/client/src/i18n/locales/zh/common.json`) correctly has `"title":"TableCraft"`; dev mode is fine. Anyone deploying from `packages/client/dist/` today would ship the old brand. Either force a rebuild in CI or delete the stale `dist/` from the tree.

### P2-4. `TAG_COLORS` missing entries for two registered tags

- `packages/client/src/lib/tags.ts:9-17` maps 7 tags: `策略 / 棋类 / 推理 / 卡牌 / 派对 / 休闲 / 骰子`.
- Registered games also use `'语言'` (`games/undercover/shared.ts`) and `'团队'` (`games/codenames/shared.ts`). These two tags render without color class — the consumer just falls back to whatever the caller provides. Undercover/Codenames chips will look uncolored compared to siblings.
- Fix: add `语言` and `团队` to `TAG_COLORS` with a color from the DESIGN.md palette.

### P2-5. Mobile lobby: "View all" + QuickJoinBar in one row reads as cramped even before overflow

- Related to P1-2 but a UX observation: on 375 px the Active-rooms section head crams a title + an input + a button + a "查看全部 →" link. Even after fixing the overflow, the actions slot is too busy on mobile. Consider stacking vertically below the title on `<sm`.
- Screenshot: `01-lobby-mobile.png` top of "进行中的房间" block.

### P2-6. Right sidebar (LobbySidePanel) never collapses on /me for guests

- `/me` while signed-out redirects (correctly) to a centered "你尚未登录 / 返回游戏" card. But the screenshot `03-me-desktop.png` dimensions are 1440×900 (the Me page on its own; no Lobby sidebar). That is correct behaviour for the Me page, but `onBack` takes the user back to `/` which on desktop re-renders the full lobby with the long sidebar. Not a bug, confirming as WAI.

### P2-7. Clicking a game **card** in the Lobby does not start a room (confirmed; flagging as UX, not a bug)

- `tmp/qa-script.ts` clicked `[data-game-id="gomoku"]` and took a screenshot — page was unchanged (just the lobby, no navigation). By design: `Lobby.tsx` uses card-click to set `gameFilter`; the player has to press the hero "+ 创建房间" CTA to actually create. Not a bug, but this clashes with the common assumption that a tile click → start a match. Consider renaming the CTA or making cards directly call `handleCreateRoomCta`.

---

## P3 — nits

### P3-1. i18n key-name asymmetry: `lobbyPanel.tab.{leaderboard,profile,recent}` vs `lobbyPanel.friends.tabLabel`

- `packages/client/src/components/layout/LobbySidePanel.tsx:852-860`:
  ```
  leaderboard: t('lobbyPanel.tab.leaderboard'),
  friends:     t('lobbyPanel.friends.tabLabel'),   // ← odd one out
  profile:     t('lobbyPanel.tab.profile'),
  recent:      t('lobbyPanel.tab.recent'),
  ```
  Three tab labels live under `lobbyPanel.tab.*`; the friends tab label lives under `lobbyPanel.friends.tabLabel`. Key resolves correctly in both locales (verified: `en: "Friends"` / `zh: "好友"`), so no user-visible bug — just an inconsistency that will trip up future translators and search-by-key. Consider moving to `lobbyPanel.tab.friends`.

### P3-2. React Router v7 future-flag warnings on every page

- Every page load logs two console warnings:
  - `React Router will begin wrapping state updates in React.startTransition in v7`
  - `Relative route resolution within Splat routes is changing in v7`
- Harmless, but floods the dev console. Pass `{ v7_startTransition: true, v7_relativeSplatPath: true }` to `<BrowserRouter future={...}>` to silence.

### P3-3. Stale JSX `defaultValue:` fallbacks in English everywhere

- `packages/client/src/components/layout/GameRoomLayout.tsx:L?` has six `t('header.*', { defaultValue: 'Leave the match?' })` etc. I verified the keys DO exist under `game-ui` namespace (common.json has no `header` — it's in `game-ui.json`) so the defaults are dead code paths. Removing them would avoid English leaking if someone ever re-parents the component without the `game-ui` namespace. Not urgent.

### P3-4. `.className.toString()` produces `[object SVGAnimatedString]` in overflow probes

- Cosmetic; only affects diagnostic output from `tmp/qa-*.ts`. Not worth changing.

---

## Not a bug — investigated and confirmed OK

- **Brand rename coverage.** Tab title (`packages/client/index.html:6`), nav logo (`Lobby.tsx:215`, renders `t('app.title')`), zh+en `common.json` `app.title` all say `TableCraft`. No source file under `packages/` still contains `桌游大全`. Confirmed via `rg '桌游大全' packages/`.
- **i18n locale parity.** `zh/common.json` vs `en/common.json` and `zh/game-ui.json` vs `en/game-ui.json` — both pairs have identical keys (151 / 30 entries respectively). No orphans.
- **Chinese in source outside `locales/`.**  Found only in:
  - `packages/server/src/lib/moderation.ts` — profanity list, correctly in-source as data, not translatable.
  - `packages/shared/src/**` — code comments only.
  - `packages/client/src/lib/tags.ts` — documented "source of truth is Chinese tag name" (see P2-4 for the missing ones).
  - `packages/client/src/components/LocaleSwitch.tsx:14` — the `中文` label on the switch button, intentionally bilingual.
- **All routes resolve.** `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/me`, `/games`, `/rooms`, `/leaderboard`, `/rooms/:id`, `/rooms/:id/play`, `/rooms/:id/watch`, `*→/` all wired in `packages/client/src/App.tsx`. Guest navigation to `/me` falls through to a "signed out" panel (see `Me.tsx:L?` `authedUser == null` branch).
- **Network errors.** No `req-failed` or `pageerror` observed during audit (full log: `tmp/qa-shots/1777626730181/console.log`). Only warnings are the Router v7 future-flag ones (P3-2).
- **API rate limit bump.** Verified indirectly: the playwright script made 50+ requests within the audit window with no 429s.
- **Socket.io proxy error on dev startup.** `[vite] http proxy error: /socket.io/?EIO=4... AggregateError` in `tmp/dev.log` — appeared once during the gap between Vite starting (t≈239ms) and the server binding to 3001 (t≈24s, cold Postgres). Self-resolves. Not user-visible.

---

## Reference data

### Full i18n parity run
```
only in zh: []
only in en: []
zh total: 151 en total: 151     # common
game-ui total zh: 30 en: 30      # game-ui
```

### Mobile overflow probe (`tmp/qa-overflow.ts`, 375×812, zh)
```
bodyScrollWidth: 382, bodyClientWidth: 375, docScrollWidth: 382, docClientWidth: 375
suspect #1: BUTTON, cls="inline-flex items-center gap-0.5 text-sm font-semibold text-muted-foreground"
            left=310 right=382 w=72
            parents: DIV.flex items-center gap-3 min-w-0 → DIV.flex items-center justify-between gap-3 mb-3 → SECTION.scroll-mt-20
```

### Desktop overflow probe (`tmp/qa-desktop-overflow.ts`, 1440×900)
```
lang=zh: bsw=1440 bcw=1440  [clean]
lang=en: bsw=1481 bcw=1440  [41 px overflow]
         suspects: BUTTON "Recent" right=1457; collapse BUTTON right=1481
```

### Screenshot inventory (`tmp/qa-shots/1777626730181/`)
```
01-lobby-{desktop,mobile}.png           02-leaderboard-{desktop,mobile}.png
03-me-{desktop,mobile}.png              04-gamesAll-{desktop,mobile}.png
05-roomsAll-{desktop,mobile}.png        06-lobby-en-desktop.png      ← P1-1 evidence
07-gomoku-room-after-click.png (see P2-7)
09-{gomoku,texas-holdem,battleship}-waiting.png
console.log                             ← full browser console dump
```

### Dev-server status
- Started by this audit via `pnpm dev` (PID logged to `tmp/dev.log`). API on 3001, client on 5173. `tmp/dev.log` shows a clean startup apart from:
  - `BETTER_AUTH_SECRET not set — using insecure dev default` (expected in dev)
  - `no email transport configured` (expected)
  - `no POSTHOG_API_KEY`, `no SENTRY_DSN` (expected)
  - Bot token printed: `ghb_uNAoFar9NpRecVbeOuZIM3clYpy-` (rotated per restart — fine).
