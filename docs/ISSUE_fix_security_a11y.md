# ISSUE: Security + A11y + Contrast fixes

Three focused fixes from the P0/P1 review.

## Changes

1. **Backend security (P0): gate `POST /api/admin/token` by `NODE_ENV`.**
   - File: `packages/server/src/api/router.ts`
   - In production, the endpoint now returns `404 { ok: false, error: 'Not found' }` so its existence is hidden from unauthenticated probes. Dev/test behavior (returns `201` + new bot token) is unchanged. Comment updated to `// --- Admin endpoints (dev only; gated in production) ---`.

2. **A11y (P1): dialog semantics + Escape handler on `GameOverModal`.**
   - Files: `packages/game-ui/src/feedback/GameOverModal.tsx` (modified), `packages/game-ui/src/feedback/GameOverModal.test.tsx` (new).
   - Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="game-over-title"`, and gave the `<h2>` the matching id. Added a `useEffect` keydown listener so `Escape` invokes the first available callback (preference order: `onReturnToLobby` → `onReturnToRoom` → `onRestart`). Added a `useRef` so the first rendered action button receives focus on mount. Backdrop click behavior is preserved (no dismiss — intentional for game results). Used Approach B (manual ARIA) because `packages/game-ui` has no shadcn/dialog primitive in its deps; adding one would require new deps and was out of scope.
   - Test file covers the three required assertions (dialog attributes present, Escape dispatches correctly with and without optional callbacks).

3. **Contrast (P1): replace `text-[#9c8b78]` with `text-muted-foreground` in `Room.tsx`.**
   - File: `packages/client/src/pages/Room.tsx` (two occurrences: player-list header line 50, "Not ready" status line 72).
   - A `rg 'text-\[#9c8b78\]' packages/client/src/` now returns zero results. The hardcoded hex on line 62 is `border-[#9c8b78]` (not `text-`) — left untouched per the surgical-changes rule and the task's explicit scope (`text-[#9c8b78]`).

## Verification

- `npx tsc --noEmit -p packages/shared/tsconfig.json` — clean.
- `npx tsc --noEmit -p packages/game-ui/tsconfig.json` — clean.
- `npx tsc --noEmit -p packages/client/tsconfig.json` — one error (`games/splendor/Board.tsx: Cannot find name 'GEM_LABEL'`). This is a file edited by a different parallel worker and is explicitly out of my scope. My three files add zero typecheck errors.
- `npx vitest run --project server` — 13 files, **109/109 tests pass**.
- `npx vitest run --project game-ui` — my new `GameOverModal.test.tsx` passes (4/4). 6 pre-existing failures in `SidePanel.test.tsx` (`window.localStorage.clear is not a function`) are unrelated to this slice (that file was not touched). `GameOverModal` itself passes on its own.
- Client `vitest` shows pre-existing `GameRoomLayout.test.tsx` localStorage failures — also unrelated (another worker's file + known jsdom shim issue). Room.tsx has no test file.

## Deviations

- **No router-level integration test added for the NODE_ENV gate.** The task permitted skipping if non-trivial infra was required. The existing `points.test.ts` pattern requires a full Postgres test DB + BetterAuth + session middleware setup just to exercise a one-line env check; the cost/value tradeoff favored skipping. The change itself is one conditional — trivially verifiable by inspection. Gate logic: `if (process.env.NODE_ENV === 'production') return 404`.
- **Focus trap not implemented.** Approach B spec called for focus-on-first-button (done) but not a full tab-trap; adding one would require additional scaffolding (focusable-element queries, sentinel elements) beyond the surgical scope. Escape + initial focus + dialog semantics cover the main a11y wins.

## Files touched

- `packages/server/src/api/router.ts`
- `packages/game-ui/src/feedback/GameOverModal.tsx`
- `packages/game-ui/src/feedback/GameOverModal.test.tsx` (new)
- `packages/client/src/pages/Room.tsx`
- `docs/ISSUE_fix_security_a11y.md` (this file)

No commit performed — working tree left for orchestrator review.
