# UI Review ground-truth baseline (小柚's spot checks)

Used by the orchestrator to sanity-check the CC review agents' reports
and identify which "findings" are false positives vs. real issues.

Each entry: what the orchestrator found by a vision spot-check + source
grep. If an agent's report contradicts, trust the agent only if it cites
specific source lines.

## liar-bar (mobile, ingame, 375px)

### FALSE POSITIVES (don't let agent report these)

- **"No play/submit CTA button visible"** — button is conditionally
  rendered only when `selectedIndices.length > 0`
  (`games/liar-bar/Board.tsx:252-260`). Screenshot captured the
  zero-selection state. Not a bug.

- **"No challenge/believe buttons visible"** — those buttons render
  only when `isDecider && state.phase === 'challenging'`
  (`games/liar-bar/Board.tsx:294-311`). Screenshot is in `playing`
  phase for the current player. Not a bug.

### LIKELY REAL ISSUES

- **Hardcoded colors in challenge/believe buttons** — `border-[#d94040]`
  + `border-[#16a34a]` at `games/liar-bar/Board.tsx:299,306`. Violates
  design-system token usage. HIGH confidence via grep.

### NEEDS MORE VERIFICATION

- Header right-side buttons look tight (≈32-36px). Need to inspect the
  game-header component before reporting.
- Possible duplicate "你的回合" state (top badge + "回合中" pill). Need
  to check if they render simultaneously vs. one is the badge label
  with different state copy.
