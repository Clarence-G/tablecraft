# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a concrete audit task with a self-contained spec below. No clarifying questions — just do it.

# TASK: UI/UX review agent for TableCraft game boards

You are a **senior UX/UI reviewer** auditing TableCraft board-game UIs by taking screenshots with Playwright and reading them yourself using your vision ability (`Read` tool on PNG files works for images). You identify concrete, surgical UX issues — not vague "make it better" suggestions. You produce a markdown report the dev team can act on.

## Project path
`/Users/bytedance/Projects/tablecraft` — pnpm monorepo. Run everything from here.

## Prerequisites — check these BEFORE touching anything

1. **Postgres up**: `pg_isready -h localhost -p 5432` → `accepting connections`. If not, tell the user to `brew services start postgresql@17` and halt.
2. **Dev server up**: `curl -sS http://localhost:3001/api/health` → `{"ok":true,...}` AND `curl -sS -o /dev/null -w "%{http_code}" http://localhost:5173` → `200`. If either fails, start dev server: run `nohup zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft && pnpm dev' > /tmp/ui-review-dev.log 2>&1 &` and poll `/api/health` up to 30× (2s apart) before proceeding. **Do NOT run `pnpm dev` in foreground — it blocks forever.** If after 30 tries the health check still fails, tail `/tmp/ui-review-dev.log` and halt with the error.
3. **CWD and git state**: `git status -s` — note it. Sibling workers may have unstaged changes. **Never** stash/reset/checkout.

## Arguments

The user will pass a list of game IDs as the task input (e.g. "review battleship and gomoku"). If they say "all", discover the list via `curl -sS http://localhost:3001/api/games | jq -r '.data[].id'`. If unclear, default to `battleship` only (the game the user most recently complained about).

## What to do — the pipeline

### Step 1: Take targeted screenshots

Write a one-shot Playwright script at `scripts/ui-review-shoot.ts` that, for each target game:

**For ALL games** — capture 4 frames per game (desktop 1440×900 + mobile 375×812, two moments each):
- `<game>_waiting_<viewport>.png` — inside the waiting room, before `start`
- `<game>_ingame_<viewport>.png` — after `start` + ~5s for the board to render

**For `battleship` specifically** — 2 extra frames per viewport (so 8 total for battleship):
- `<game>_placement_<viewport>.png` — in placement phase, with a ship selected and hovering over a cell (to capture the rotation-preview silhouette + hover ghost glow the user just shipped)
- `<game>_firing_<viewport>.png` — in playing phase, mid-fire, with 2-3 shots already resolved (HIT + MISS mix visible)

Structure it like the existing `scripts/shoot-games.ts` (read that file end-to-end first — it already handles create-room + bot-join + ready + start). Reuse its helpers instead of rewriting. The four non-obvious traps from the dev-server skill still apply:
- Import from `@playwright/test`, not `playwright` (latter isn't installed).
- No `__dirname` — derive paths from `import.meta.url`.
- `screenshots/` is `.gitignore`'d — **do not** force-add the review screenshots; the report references them locally.
- Don't `waitUntil: 'networkidle'` against localhost socket.io — use `domcontentloaded` + explicit waits.

Output directory: `screenshots/ui-review/<timestamp>/` where timestamp is `date +%Y%m%d-%H%M%S`. Create it first.

To trigger the extra battleship moments: after `start` you'll be in placement phase. Use the CLI (`packages/cli`) — see `skill_view('tablecraft-dev-server', 'references/cli-surface-area.md')` for commands — to have the bot complete its placement and also send a couple of shots, while your Playwright session stays in the human's browser to capture the UI at each interesting moment. Split into small phases: (a) pick a ship + move mouse to cell (don't click) → screenshot `placement`; (b) click-confirm the full placement + let bot place + start firing → capture `ingame` (both grids rendered); (c) take 2-3 shots (click cells on enemy grid) → wait for bot reply → screenshot `firing`.

If any single game's pipeline fails, catch the error, log it, save whatever partial screenshot you have as `<game>_<phase>_<viewport>-ERROR.png`, and proceed to the next game. Never abort the whole run.

### Step 2: Review each screenshot using YOUR vision

For every PNG you just produced, use the `Read` tool to view the image (Claude Code's Read tool supports PNG/JPG and routes through vision). For each image, evaluate against this rubric and record findings:

**Rubric — 5 dimensions, score each 1-5 and note concrete issues:**

1. **Visual hierarchy & readability** — Is the primary action obvious? Can you read the game state at a glance? Contrast ratios, font sizes, spacing.
2. **Feedback & state visibility** — Does the UI show whose turn it is? Is hover/click feedback present? Loading/waiting states? Error states?
3. **Information architecture** — Is info grouped sensibly? Anything redundant, missing, or displaced? Side-panel vs. main-board split?
4. **Touch/click targets & mobile fitness** — At 375px, are tap targets ≥44×44 CSS px? Is anything clipped, overflowing, or requiring horizontal scroll?
5. **Skeuomorphic/design-system consistency** — Follows DESIGN.md (cream bg, thick brown borders, hard offset shadows)? Hardcoded colors leaking? Uses lucide icons not emoji?

**Scoring calibration (don't hand out 5s):**
- 5 = zero issues, could ship to production as-is
- 4 = 1 minor nit
- 3 = 1-2 real issues worth fixing
- 2 = multiple real issues OR one severe issue
- 1 = broken / unusable

**For each issue, produce an entry with:**
- `severity`: `critical` (blocks gameplay) | `major` (noticeable to any user) | `minor` (nitpick)
- `category`: one of the 5 rubric dimensions
- `screenshot`: file name
- `location`: WHERE in the image — "top-right chat icon", "row 3 col 3 of enemy grid", "Ready button area", etc.
- `issue`: 1-2 sentence factual description of what's wrong (not "could be better" — be specific: "tap target is 32×32px, below WCAG 44×44 minimum")
- `suggestion`: 1-sentence concrete fix ("increase button padding to p-3 so the tap target becomes 48×48")

**Be stingy with praise; dev team asked for issues, not affirmation.** But also don't invent problems. If an image looks fine, say so briefly and move on.

### Step 3: Write the report

Output: `screenshots/ui-review/<timestamp>/REPORT.md`.

Structure:
```markdown
# UI Review — <date> <time>

**Reviewer**: Claude Code (vision)
**Scope**: <game1>, <game2>, ...
**Viewports**: desktop 1440×900, mobile 375×812
**Total screenshots**: N

## Executive summary

3-5 bullets. What's the single biggest problem? Which game is healthiest / worst? Any systemic issues (e.g. "every game's mobile layout clips the side panel")?

## Scorecard

| Game | Viewport | Phase | Score | # issues |
|---|---|---|---|---|
| battleship | desktop | ingame | 3/5 | 4 |
| ... |

Overall average, and call out the worst-scoring row.

## Findings by severity

### Critical (N)
- [game/phase/viewport] — issue — suggestion (↪ screenshot path)
- ...

### Major (N)
- ...

### Minor (N)
- ...

## Per-screenshot notes

For each screenshot, a short paragraph covering what you saw and all issues you flagged. Group by game, then phase, then viewport. Reference the absolute path to the PNG so the reader can click it open in Finder.

## Recommendations

Prioritized list. Top 3 things to fix this sprint.
```

Also write `screenshots/ui-review/<timestamp>/findings.json` with the structured array of all issues (same fields as above) so future automation can consume it.

### Step 4: Surface the report

At the end, print to stdout:
- Absolute path to `REPORT.md`
- Absolute path to the screenshot directory
- A one-line summary: "N screenshots reviewed, M issues found (C critical, X major, Y minor)."

## Non-goals (do NOT do these)

- **Do NOT fix any of the issues you find.** You are a reviewer, not an implementer. Put them in the report and stop.
- **Do NOT commit anything** other than the newly added `scripts/ui-review-shoot.ts` and the `.cc-prompts/ui-review.md` itself (if you edited it). Screenshots and the report stay under `screenshots/ui-review/` which is gitignored.
- **Do NOT create new i18n keys, new components, new CSS tokens.** Audit only.
- **Do NOT touch games/* Board.tsx, packages/*, skill_data/**. Read-only.

## Quality bar — self-check before writing the report

Before you declare done, confirm:
- [ ] Each target game produced at least 2 screenshots (waiting + ingame) for both viewports.
- [ ] Every screenshot was read by you via the `Read` tool and has at least one note in the per-screenshot section.
- [ ] The findings.json is valid JSON and every entry has all required fields.
- [ ] The scorecard table adds up (N games × phases × viewports) and the "# issues" column matches the per-screenshot notes.
- [ ] No "could be improved" hand-waving in the issues — every issue is falsifiable and measurable.

If any self-check fails, fix the gap before announcing completion.

## Success criteria

Running this prompt end-to-end produces:
1. A timestamped `screenshots/ui-review/<ts>/` directory with the PNGs.
2. A `REPORT.md` and `findings.json` inside that directory.
3. A stdout one-liner pointing at the report.
4. Zero changes to game/package source code.
5. Actionable, specific, measurable issues — the kind a developer can fix in <30 min each without clarification.
