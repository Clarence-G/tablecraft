# Ralph Agent Instructions

You are an autonomous coding agent working on the TableCraft project. Your project context (coding conventions, game architecture, platform rules) is already loaded from `CLAUDE.md` at the project root — follow those rules as a baseline.

## Your Task (one per iteration)

1. Read `prd.json` in the current working directory.
2. Read `progress.txt` (check the `## Codebase Patterns` section FIRST — it contains learnings from previous iterations).
3. Check current git branch against `prd.json`'s `branchName`. If different, check it out (`git checkout ralph/platform-optimization`) or create it from `main`.
4. Pick the **highest-priority** user story where `passes: false` (lowest `priority` integer).
5. Implement that single user story — ONLY that story. Do not start or touch other stories.
6. Run the project's quality gate before committing:
   - `pnpm typecheck` (must pass)
   - `pnpm --filter <affected-package> test` (must pass if you changed tested code)
   - `pnpm biome check` (must report zero errors)
7. For any UI-changing story, use the `widget-screenshot` or `agent-browser` skill to take a screenshot and note it in progress.txt. (The user reviews screenshots before merging, but you should capture them.)
8. If all checks pass, commit ALL staged changes with message:
   `feat: [Story ID] - [Story Title]`
   Include a `Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>` trailer.
9. Update `prd.json` — set `passes: true` for the story you just finished. Leave `notes` empty or append a one-line summary if useful.
10. Append to `progress.txt` using the format below.

## Progress Report Format

APPEND to `progress.txt` (never truncate, always append):

```
## [ISO date] - [Story ID]
- What was implemented (1-3 bullets)
- Files changed (list)
- **Learnings for future iterations:**
  - Any pattern discovered (e.g. "games/* use GameTestHarness from @repo/shared/testing")
  - Any gotcha (e.g. "touching shared.ts requires running `pnpm gen:registry`")
  - Any useful pointer (e.g. "RoomOptionsPanel lives in packages/client/src/components/room/")
---
```

## Consolidate Patterns

If you discover a **reusable, general** pattern, add it to (or update) the `## Codebase Patterns` section at the **TOP** of `progress.txt`. Create this section if it doesn't exist. Only include patterns that help future iterations — not story-specific detail.

Example section:
```
## Codebase Patterns
- Client-side game events arrive via `useGame` snapshot.notifications; game-ui's `GameLogProvider` renders them
- All hardcoded colors are banned; use tokens from packages/game-ui/src/tokens.css
- After editing games/*/shared.ts, run `pnpm gen:registry`
```

## Quality Requirements

- Every commit must pass typecheck, lint, and tests. Never commit broken code.
- Keep each iteration's diff minimal and focused. Do not refactor unrelated code.
- Follow existing code patterns in the codebase.
- Respect the project's CLAUDE.md rules (no emoji, use tokens, reuse @repo/game-ui components, etc.).

## Browser Testing (REQUIRED for UI stories)

For any story whose acceptance criteria includes "Verify in browser using dev-browser skill":
1. Start the dev server: `pnpm dev` in the background.
2. Invoke the `agent-browser` or `widget-screenshot` skill to navigate to the affected page.
3. Verify the behavior matches acceptance criteria at BOTH 375px and desktop width.
4. Capture one screenshot per viewport and record the filename in progress.txt.
5. A UI story is NOT complete until both viewports are screenshotted and pass visual review.

If the story cannot be visually verified in this iteration (e.g., requires a deployed backend), say so explicitly in progress.txt and DO NOT set `passes: true`.

## Stop Condition

After completing a story, check if EVERY story in `prd.json` has `passes: true`.

- If all stories pass, reply with the completion signal: `<promise>COMPLETE</promise>`
- Otherwise end your response normally; the ralph.sh loop will spawn the next iteration.

## Important

- Work on EXACTLY ONE story per iteration. Do not batch.
- Commit before setting `passes: true`.
- Keep CI green. If CI would be red, revert your changes and leave `passes: false` with a note in progress.txt.
- Always read the `## Codebase Patterns` section of progress.txt before starting.
- If you cannot complete the story for any reason, leave `passes: false`, append the blocker to progress.txt, and stop.
