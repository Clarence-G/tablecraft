# UI Review Agent

Claude Code worker that screenshots game boards, reads them with vision, and produces a markdown UX/UI review report.

## What it does

Given a list of game IDs, it:

1. **Screenshots** each game at multiple phases (waiting room + in-game, plus battleship-specific placement + firing frames) across desktop (1440×900) and mobile (375×812) viewports. Saved to `screenshots/ui-review/<timestamp>/`.
2. **Reads** every PNG via Claude Code's built-in vision (`Read` tool on image files).
3. **Scores** each screenshot 1-5 on 5 rubric dimensions (hierarchy, feedback, info architecture, touch targets, design-system consistency).
4. **Writes** `REPORT.md` + `findings.json` with severity-tagged issues, each with `location`, `issue`, and concrete `suggestion`.
5. **Does not touch source code** — audit only.

## Quick start

```bash
# Make sure dev server is up (pnpm dev in another terminal or tmux)
pg_isready -h localhost -p 5432       # postgres?
curl -sS http://localhost:3001/api/health  # server?
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173  # client?

# Default — audit battleship only
bash .cc-prompts/launch-ui-review.sh

# Specific games
bash .cc-prompts/launch-ui-review.sh "battleship gomoku uno"

# Every game the API exposes
bash .cc-prompts/launch-ui-review.sh all

# Monitor
tmux capture-pane -t cc-ui-review -p -S -80 | tail -40
tmux attach -t cc-ui-review

# Kill
tmux kill-session -t cc-ui-review
```

Run duration: typically 5-15 minutes for 1-3 games (most time is Playwright startup + vision reads).

## Output layout

```
screenshots/ui-review/20260507-121530/
├── REPORT.md                          ← human-readable report
├── findings.json                      ← structured issue list
├── battleship_waiting_desktop.png
├── battleship_waiting_mobile.png
├── battleship_placement_desktop.png   ← battleship-specific
├── battleship_placement_mobile.png
├── battleship_ingame_desktop.png
├── battleship_ingame_mobile.png
├── battleship_firing_desktop.png      ← battleship-specific
└── battleship_firing_mobile.png
```

Each non-battleship game produces 4 frames (waiting × 2 viewports, ingame × 2 viewports).

## Report structure

- **Executive summary** — 3-5 bullets: biggest problem, best/worst game, systemic issues.
- **Scorecard** — table of `game × viewport × phase → score + issue count`.
- **Findings by severity** — grouped `critical → major → minor`.
- **Per-screenshot notes** — paragraph per PNG with observations.
- **Recommendations** — top 3 fixes for this sprint.

## When to use it

- After shipping a visual change (new game, polish PR, design refactor) → audit to catch regressions.
- Before a demo / release → baseline pass on the games you're showing.
- When a user complains about a specific UX issue and you want a second opinion with concrete examples.

## When NOT to use it

- To regenerate marketing screenshots → use `scripts/shoot-games.ts` or `scripts/capture-readme-shots.ts` instead (same infra, no LLM overhead).
- To run visual-regression diffs → this is qualitative review, not pixel-diff. Use Playwright's built-in snapshot tool for pixel-diff.
- To audit lobby / waiting-room UI → the prompt focuses on in-game boards. Add frames explicitly if you need lobby coverage.

## Customization

Edit `.cc-prompts/ui-review.md` to change:

- **Rubric weights** — all 5 dimensions currently equal.
- **Scoring calibration** — e.g. raise bar so "5" means zero issues across ALL dimensions.
- **Per-game extra frames** — add similar special-case blocks to the `battleship` pattern for games with complex phases (e.g. uno's hand-fan, texas-holdem's betting round).
- **Viewport sizes** — if you want tablet (768px) add a third viewport.

## Extending to other pages

The current prompt only covers in-game boards. To add lobby/waiting-room/profile-page audits, fork the prompt (`.cc-prompts/ui-review-lobby.md`) and swap the Playwright navigation phase. Keep the Step 2 rubric identical so reports are comparable.
