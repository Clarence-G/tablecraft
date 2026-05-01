# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped QA audit task. Skip straight to execution — read files, browse, screenshot, file ISSUE doc. No clarifying questions, no companion offers. DO NOT fix any bugs you find — just report them.

# QA worker: Exploratory dogfood pass across Lobby + brand rename + Stage 1/2/3 features

You are a QA audit worker on TableCraft. In the last 24h the orchestrator landed:

- Lobby UX redesign (LobbySidePanel with 3 tabs, period pills, hero redesign)
- Brand rename `桌游大全` → `TableCraft` across all surfaces
- Stage 1.5 PGlite → Postgres migration
- Stage 2 E2E coverage (12 specs)
- Stage 3 socket.io reconnect + spectator + friends system
- Friends panel DELETE → JSON envelope fix
- Dev API rate limit bump

Your job: **find problems that automated tests cannot catch**. Read code, click around the running app, take screenshots, and file a report. **DO NOT fix anything.** Orchestrator will triage.

## Environment

- Working dir: `/Users/bytedance/Projects/boardgames`
- Dev server: RUNNING on http://localhost:3001 (API) + http://localhost:5173 (client). Don't restart.
- Postgres: `tablecraft_dev` on :5432, migrated to 0005

## Scope (report-only, no edits)

Focus areas in priority order:

### 1. i18n completeness / drift

Run hardcoded Chinese sweep across source (NOT `locales/`):
```bash
cd /Users/bytedance/Projects/boardgames
rg '[\u4e00-\u9fff]+' packages/client/src packages/server/src packages/shared/src --glob '!**/locales/**' --glob '!**/*.test.ts' --glob '!**/__tests__/**' 2>&1 | head -60
```

Grep for English literals in rendered JSX that should be `t()`:
```bash
rg '<(p|span|div|button|label|h[1-6])[^>]*>\s*[A-Z][a-z]+' packages/client/src/pages packages/client/src/components 2>&1 | head -40
```

Identify:
- Hardcoded strings that should be i18n keys (false positives like `aria-label`, dev-only, test fixtures are OK — flag anything else)
- Missing key parity: keys in `zh/common.json` but not `en/common.json` or vice versa
- `defaultValue: '...'` with non-ASCII or non-English defaults (these leak source language)

Run:
```bash
node -e "
const z = require('./packages/client/src/i18n/locales/zh/common.json');
const e = require('./packages/client/src/i18n/locales/en/common.json');
function flatten(o, p='') { const r={}; for (const k in o) { const v=o[k]; const key=p?p+'.'+k:k; if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(r, flatten(v, key)); else r[key]=v; } return r; }
const zk = Object.keys(flatten(z)).sort();
const ek = Object.keys(flatten(e)).sort();
const onlyZh = zk.filter(k => !ek.includes(k));
const onlyEn = ek.filter(k => !zk.includes(k));
console.log('only in zh:', onlyZh);
console.log('only in en:', onlyEn);
"
```

### 2. Visual QA via browser (use Playwright's codegen-like pattern)

Use `tsx` to write a short script that opens Playwright, navigates key pages, takes screenshots. Output screenshots to `tmp/qa-shots/<timestamp>/`:

Pages to visit:
- `/` (Lobby — guest state)
- `/` (Lobby — with a seeded guest that has played 1 game so leaderboard has data)
- `/leaderboard` (full page)
- `/me` (if accessible)
- At least 3 game waiting rooms (pick gomoku, texas-holdem, battleship)
- 1 game in-progress (host gomoku + bot)

For each page, look for (report in ISSUE doc):
- Overflow / cut-off elements at 375px width (mobile) AND 1440px desktop
- Contrast issues (low-contrast text on backgrounds)
- Missing images / broken assets (404 in network panel)
- Console errors / warnings (collect via `page.on('console', ...)`)
- Misaligned elements, double scrollbars, z-index issues
- `TableCraft` branding in all 3 of: tab title, nav logo, page footer (if any)
- Stale `桌游大全` Chinese strings anywhere

Script template:
```ts
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

(async () => {
  const shotDir = `tmp/qa-shots/${Date.now()}`;
  mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch();
  const consoleLog: string[] = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => consoleLog.push(`[req-failed] ${r.url()} ${r.failure()?.errorText}`));

  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.screenshot({ path: `${shotDir}/01-lobby-desktop.png`, fullPage: true });
  
  // Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${shotDir}/02-lobby-mobile.png`, fullPage: true });

  // ... etc for other pages
  
  await browser.close();
  console.log('console log:');
  consoleLog.forEach(l => console.log(l));
  console.log('\\nscreenshots in', shotDir);
})();
```

Run: `pnpm exec tsx tmp/qa-script.ts`

### 3. Doc drift

Audit whether docs still match code:
- `docs/DESIGN.md` — cream/brown skeuomorphic rules still followed in Lobby redesign?
- `docs/LAYOUT.md` — ASCII diagram references up to date with `TableCraft` rename?
- `docs/ISSUE_STAGE_2_REMAINING.md` — is the list still accurate after today's fixes?
- `docs/ISSUE_appfix_friends.md` — any follow-up the orchestrator should track?
- `CLAUDE.md` — any stale instruction?

### 4. Route / link integrity

- Verify every nav link in the main nav works
- Verify every game icon on Lobby actually opens that game's waiting room flow
- Verify `/leaderboard` "Back to Lobby" works
- Verify Lobby sidebar expand / collapse / mobile drawer modes

## What to file

Write `docs/ISSUE_qa_audit_stage3.md` with these sections, ordered by severity:

1. **P0 — broken / unusable** — game won't load, crash, wrong page, 500 errors
2. **P1 — bugs user will notice** — hardcoded string, overflow, wrong brand, broken link, visual regression
3. **P2 — polish / UX concerns** — contrast, spacing, confusing CTA, stale docs
4. **P3 — nits** — typos, missing alt text, redundant code
5. **Not a bug** — things you investigated but concluded are working as intended (keep this section small but honest)

For each issue:
- What you saw (specific page, interaction)
- Expected behavior
- Screenshot path (if visual)
- File + line number (if code drift)
- Reproduction steps (if dynamic)

## Rules

- **DO NOT EDIT ANY SOURCE CODE.** Report only.
- **DO NOT RESTART the dev server.** Use the running one.
- **Screenshots are evidence.** No "looks off" claims without a shot.
- **Skip trivia.** Don't report "main heading is centered on page" unless it's actually broken.
- **False positives OK but flag them.** Put unsure findings in P2/P3.
- If the dev server goes down mid-audit, note it in ISSUE and bail — don't try to revive.

## Deliverables

1. `docs/ISSUE_qa_audit_stage3.md` (structured P0–P3 list)
2. Screenshots in `tmp/qa-shots/<timestamp>/`
3. Your playwright script in `tmp/qa-script.ts` (leave it, orchestrator may rerun)
4. Terminal output with i18n sweep + locale parity check in ISSUE doc

Don't commit. Don't push. Just report.

START NOW.
