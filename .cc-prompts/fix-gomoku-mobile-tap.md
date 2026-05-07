# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. Self-contained spec below. No clarifying questions — just do it.

# PARALLEL ROLLOUT NOTICE
You are running in parallel with a sibling CC worker (uno-mobile-hand). Other files in the working tree may be modified by them — EXPECTED, not a corruption. Do NOT `git stash`, `git reset`, `git checkout`, or otherwise discard untracked/unstaged changes under any circumstance. If `pnpm typecheck` fails on a file you didn't touch, read it and adapt.

---

# TASK: Gomoku mobile tap-to-confirm for 22px intersections

Full spec is at `/Users/bytedance/Projects/tablecraft/docs/ISSUE_gomoku-mobile-tap-targets.md`. Read it end-to-end FIRST. It explains the why, the interaction design, the scope fence, and verification.

## Project path
`/Users/bytedance/Projects/tablecraft` — pnpm monorepo. Run all commands from here.

## Background reading (before editing anything)

1. `docs/ISSUE_gomoku-mobile-tap-targets.md` — the full issue spec.
2. `packages/game-ui/src/board/IntersectionBoard.tsx` — the component you are modifying (end to end, 210 lines).
3. `packages/game-ui/src/board/IntersectionBoard.test.tsx` (if exists; may not — check with `ls`).
4. `games/gomoku/Board.tsx` (only to understand how it consumes IntersectionBoard — do NOT modify unless you must pass a new prop).
5. `docs/DESIGN.md` — for cream/brown/shadow conventions that ConfirmChip must follow.
6. `CLAUDE.md` §5 (project rules) — no emoji, design tokens only, 375px mobile tested.

## Scope fence — files you MAY edit

- `packages/game-ui/src/board/IntersectionBoard.tsx` — the main change.
- `packages/game-ui/src/hooks/useIsTouchViewport.ts` — NEW file, ~15 lines, `matchMedia('(max-width: 640px)')` + resize listener. Reuse existing hook if one exists under `packages/game-ui/src/hooks/` (check first).
- `packages/game-ui/src/board/IntersectionBoard.test.tsx` — NEW file if missing, otherwise extend.
- `packages/game-ui/src/index.ts` — export the new hook ONLY if external consumers need it (probably not; keep internal).

Do NOT edit:
- `games/gomoku/**` — the component should work via IntersectionBoard's internal state without gomoku's Board.tsx changing. Verify this assumption by reading `games/gomoku/Board.tsx:211` (the `<Board size={BOARD_SIZE} ...>` call site) — if the existing props are sufficient, leave it alone.
- `packages/client/**`, `packages/server/**`, `packages/cli/**`, `skill_data/**`, `games/*/Board.tsx` other than gomoku.

## What to build

Per ISSUE_gomoku-mobile-tap-targets.md "Proposed fix" section, implement the tap-to-confirm flow inside IntersectionBoard.

### Interaction contract (must implement exactly)

- **Desktop** (viewport > 640px): unchanged. Single click on a placeable cell → `onPlace(r, c)` called immediately. No confirm chip appears.
- **Mobile** (viewport ≤ 640px): two-tap commit.
  - First tap on a placeable cell (r, c) → internal state `armed = [r, c]`. No `onPlace` call yet. A preview stone appears at that cell (use the existing `previewStone` color if passed, or the `canPlace` player color). A ConfirmChip renders positioned absolute within the board wrapper showing the coordinates (e.g. "H8") and two buttons `✓` (confirm) and `✕` (cancel), each `min-h-11 min-w-11` (44px), styled per DESIGN.md (cream bg, thick brown border, hard offset shadow).
  - Second tap on the SAME armed cell → commits by calling `onPlace(r, c)`, clears armed.
  - Tap ✓ on the ConfirmChip → same as tapping the armed cell, commits.
  - Tap ✕ on the ConfirmChip → clears armed, no onPlace call.
  - Tap a different placeable cell while already armed → re-arm to that new cell (no onPlace; old armed state is replaced).
  - 4-second idle timeout with no second action → auto-cancel (clear armed state). Use `setTimeout` that clears on state change.
  - `disabled` prop or `canPlace` returning false for the armed cell → clear armed.

### ConfirmChip placement

Absolute-positioned inside the existing board `<div>` wrapper (the one with `aspectRatio: 1`). Position at the **top-right corner of the board** with 8px margin from the edges. The chip contains:

```
┌──────────────────┐
│  放在 H8？  ✓  ✕  │
└──────────────────┘
```

Translate "放在 {coord}？" is the placeholder string — since no i18n is added in this task (scope fence), hardcode it to `放在 {col}{row}？` where col = letter from `columnLetter(c)` and row = `size - r` (same Go-convention labels the coordinates use). Use `text-foreground font-semibold text-sm` for the prompt. The ✓/✕ buttons get `min-h-11 min-w-11 border-2 border-foreground bg-card shadow-card-active` each.

If you think adding i18n keys is critical, DO NOT add them — just hardcode zh. (Rationale: this is a touch-only flow, the keys would need a 10-line English counterpart, and the user's project bias is zh-first for zh users.)

## Tests — MUST add or extend `IntersectionBoard.test.tsx`

Required test coverage (use `@testing-library/react` + `vitest`):

1. Desktop direct-placement: viewport > 640px, render with a placeable cell, `fireEvent.click(cell)` → `onPlace` called once with correct (r, c). No ConfirmChip in DOM.
2. Mobile first tap arms: viewport ≤ 640px (mock `matchMedia`), click cell → `onPlace` NOT called, preview stone visible, ConfirmChip visible with correct coordinate label.
3. Mobile same-cell second tap commits: arm then click same cell again → `onPlace` called once.
4. Mobile ✓ button commits: arm, click the ✓ button in ConfirmChip → `onPlace` called once.
5. Mobile ✕ button cancels: arm, click ✕ → `onPlace` NOT called, ConfirmChip removed.
6. Mobile re-arm: arm (r1,c1), click different placeable (r2,c2) → `onPlace` NOT called, armed is now (r2,c2), ConfirmChip shows new coords.
7. Auto-cancel after 4s: use vitest `vi.useFakeTimers()` — arm, advance 4000ms, ConfirmChip gone.
8. `disabled` prop clears armed: arm, re-render with `disabled={true}` → ConfirmChip removed.

Mock `matchMedia` by setting `window.matchMedia = vi.fn().mockReturnValue({ matches: true/false, addEventListener: ..., removeEventListener: ... })` in `beforeEach`.

## Verification steps (don't skip)

Run from `/Users/bytedance/Projects/tablecraft`:

```bash
pnpm --filter @repo/game-ui test                 # new + existing tests pass
pnpm typecheck                                    # all packages green
pnpm exec tsx scripts/shoot-games.ts gomoku --mobile  # visual spot-check
```

If `typecheck` fails on files you didn't touch (e.g. a sibling worker's in-progress change), read their file, understand their contract, and adapt only your own code — do not stash/revert.

## Non-obvious traps (from project history)

- `pnpm` may not be in PATH for non-interactive shells; wrap any background command with `zsh -c 'source ~/.zshenv && pnpm ...'`. Foreground works fine.
- `patch` tool may emit lint false-positives on `packages/game-ui/src/**/*.tsx` (isolated tsc without monorepo config). Only `pnpm typecheck` at monorepo root is authoritative.
- `packages/game-ui/src/**` — if `patch` spams >2 iterations of unrelated drizzle / esModuleInterop warnings, switch to `write_file` for the rest of the task (this is a known Hermes tool quirk, not a real error).
- Don't use shell `echo`/heredoc to create files in this task — use `write_file` or `patch`.

## Done criteria

Before announcing completion:
- [ ] All 8 new tests pass.
- [ ] `pnpm typecheck` exits 0 across all packages.
- [ ] Visual spot-check screenshot (`screenshots/gomoku-mobile.png`) shows ConfirmChip top-right corner when a cell is tapped — paste confirmation.
- [ ] Write a short completion note at `docs/ISSUE_gomoku-mobile-tap-targets.md` bottom (append a `## Resolution` section) summarizing: files changed, lines +/-, test count added, any deviation from the spec + why.
- [ ] `git status -s` shows only files in your scope fence.

Do NOT commit. The orchestrator will review and commit.
