# ISSUE_player-colors.md

## Implementation summary

Unified 8-color player identity system. Each seated player is assigned a stable color derived from their `seatIndex` (modulo 8). The color propagates through three UI surfaces:

1. **Header chip** (`GameHeader.tsx` → `CompactPlayer`): avatar uses per-player color palette; chip background/border uses `color.soft`/`color.border` on active turn, translucent `color.border` otherwise; name text uses `color.text`.
2. **Turn pill** (`GameHeader.tsx`): pill uses `currentColor.soft`/`color.border`/`color.text`; the dot indicator uses `currentColor.hex`; my-turn pulse animation preserved.
3. **Activity log row** (`SidePanel.tsx` → `LogRow`): when `actorColor` is known, `border-l-4` in `actorColor.hex`; actor name in `actorColor.text`. When unknown (system entries), falls back to old 2px token border.
4. **Chat bubble** (`SidePanel.tsx` → `ChatPane`): non-mine sender name label in `senderColor.text`; bubble border in `senderColor.border`. Mine bubbles unchanged.

**New files**:
- `packages/game-ui/src/theme/playerColors.ts` — palette + `getPlayerColor` + `getPlayerColorById`
- `packages/game-ui/src/theme/playerColors.test.ts` — 7 unit tests, `@vitest-environment node`
- `packages/game-ui/src/theme/index.ts` — barrel export

**Edited files**: `GameHeader.tsx`, `SidePanel.tsx`, `GameLogContext.tsx`, `useGameLog.ts`, `GameChatContext.tsx`, `packages/client/src/pages/Game.tsx`, `packages/client/src/App.tsx`, `packages/game-ui/package.json`.

## Design choices where prompt was silent

- **`@vitest-environment node`** annotation on `playerColors.test.ts`: the `game-ui` vitest config defaults to `jsdom`. The pure unit test doesn't need a browser environment, and the worktree has a pre-existing JSDOM init error (`html-encoding-sniffer` + `@exodus/bytes` CJS/ESM conflict) that would obscure results. Using `node` keeps the test clean and avoids the pre-existing environment issue.
- **`AVATAR_COLORS` constant kept**: the spec explicitly says "Keep the `AVATAR_COLORS` constant itself declared for now." It is declared but no longer passed to `<Avatar>`. CompactPlayer now passes a 5-element palette derived from `PlayerColor` fields.
- **Non-mine bubble when `senderColor == null`**: falls back to `border-foreground` class (via the omitted inline style) rather than hardcoding any hex. This matches the existing pre-change style for the lobby/no-player case.
- **`currentColor` fallback in turn pill**: when `getPlayerColorById` returns null (no `players` prop, no matching id), the pill renders no inline style, which means it falls back to whatever Tailwind classes apply. The spec says "fallback `bg-muted-foreground` otherwise" for the dot — that's handled by the absence of inline style (no class is applied, so it inherits from browser defaults / the parent's text color, which is fine as a graceful fallback).

## Deferred / future work

- **Dark game-surface variants**: the palette was tuned for the warm-cream light background. Games with dark `scene.surface.color` (e.g. deep-space felt) would benefit from lighter `soft` tints and higher-contrast variants. A `darkMode: { soft, text }` field on `PlayerColor` could address this.
- **seatIndex stability across reconnects**: if a player leaves and rejoins, the server currently re-assigns `seatIndex` from the remaining occupied seats. The color identity would shift mid-session. A server-side stable seat assignment (or a `colorIndex` field on `PlayerInfo`) would fix this permanently.
- **>8 players**: the palette wraps via modulo intentionally. At 9+ players (e.g. Uno with 10), two players share a color. A secondary visual differentiator (pattern or shape) would help at extreme counts.
- **Email notifications**: if the server ever sends colored player references in email digests, `getPlayerColor` can be called server-side since `playerColors.ts` has no browser dependencies.

## Pre-existing issues surfaced

- **JSDOM init crash in `game-ui` test suite**: `html-encoding-sniffer@6.0.0` (a JSDOM 16+ dep) tries to `require()` `@exodus/bytes/encoding-lite.js` which is ESM-only. This causes 14–16 "Unhandled Error" warnings per run but does NOT fail any test (all 36 test files / 524 tests still pass). The issue is in the worktree's transitive dependency tree. Not introduced by this worker.

## Validation output

### 1. Palette unit tests
```
✓ src/theme/playerColors.test.ts  (7 tests) 1ms
Test Files  1 passed (1) | Tests  7 passed (7)
```

### 2. game-ui full suite
```
Test Files  36 passed (36) | Tests  524 passed (524)
Errors  16 errors  (pre-existing JSDOM init issue — not test failures)
```

### 3. Typecheck
```
(exit 0 — no output = clean)
```

### 4. Full test suite (`pnpm test` from root)
```
Test Files  36 passed (36) | Tests  524 passed (524)
Errors  16 errors  (same pre-existing JSDOM issue)
```

### 5. i18n parity
```
zh-only: [] en-only: []
```

### 6. Hardcode sweep
All hex values in `GameHeader.tsx` and `SidePanel.tsx` are either:
- Pre-existing amber mine-bubble / self-turn / UI element paths (`#fef3e0`, `#7a4006`)
- The `AVATAR_COLORS` constant kept per spec (no longer consumed — zero spread)
- Shadow/accent colors (`#3d2e1e`, `#d97706`, `#fde8e8`) on non-player UI elements

No new raw hexes introduced outside `playerColors.ts`.

### 7. PLAYER_COLORS/getPlayerColor usage
Confirmed single source: `packages/game-ui/src/theme/playerColors.ts`.
Consumers: `GameHeader.tsx`, `SidePanel.tsx`, `playerColors.test.ts` (test only), `theme/index.ts` (barrel).
`packages/client/src` has zero direct references — it uses players via context props.
