# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# Worker: player-colors — 玩家色系统

You implement a unified "player color" system so each seated player gets a distinct stable color identity that propagates through the header (turn indicator + avatar chip), the activity log, and the chat pane.

**Working directory**: `/Users/bytedance/Projects/tablecraft-worker-player-colors` (a git worktree on branch `worker/player-colors`). ALL your edits land there. Do NOT cd to `~/Projects/tablecraft`.

## TableCraft iron rules (ALL apply, no exceptions)

1. **i18n strict**: every user-visible string goes through `t(key)`. Zero hardcoded Chinese/English in `.tsx` / `.ts` files. Every new key in BOTH `packages/client/src/i18n/locales/{zh,en}/common.json` AND `packages/game-ui/src/i18n/locales/{zh,en}/game-ui.json` as appropriate. NEVER use `defaultValue` with non-ASCII fallback. **This task likely requires ZERO new i18n keys** — it's visual-only.
2. **No emoji.** Lucide icons only for UI.
3. **Use design tokens.** Hex color values belong in ONE place — the `PLAYER_COLORS` array you author in Step 1. Do not sprinkle raw hexes across other files. Consumers import `getPlayerColor(seatIndex)` and read `.hex / .border / .soft / .text`.
4. **Typecheck is truth**: `patch` tool's isolated-file TS errors are false positives in pnpm monorepo. Trust `pnpm typecheck` end-to-end.
5. **Surgical changes**: every line you add must trace to this spec. Don't "clean up" or "improve" unrelated code. No refactors.
6. **Mobile + desktop both work** at 375px and ≥1024px.
7. **Don't touch other workers' files** — scope is declared below.
8. **Use `useIsTouchViewport`** if you need viewport branching. Do not inline `matchMedia`.

## Scope fence (this worker's editable paths)

- **NEW**: `packages/game-ui/src/theme/playerColors.ts`
- **NEW**: `packages/game-ui/src/theme/playerColors.test.ts`
- **NEW**: `packages/game-ui/src/theme/index.ts` (barrel) — only if a barrel doesn't already exist
- **EDIT**: `packages/game-ui/src/header/GameHeader.tsx` (CompactPlayer + turn pill)
- **EDIT**: `packages/game-ui/src/side-panel/SidePanel.tsx` (LogRow + ChatPane sections only)
- **EDIT**: `packages/game-ui/src/log/GameLogContext.tsx` (add optional `players` to context value; do NOT change `playerNames` shape)
- **EDIT**: `packages/game-ui/src/chat/GameChatContext.tsx` (add optional `players` to `GameChatContextValue`)
- **EDIT**: `packages/client/src/pages/Game.tsx` (pass `players={room.players}` into `GameLogProvider`)
- **EDIT**: `packages/client/src/App.tsx` (pass `players: roomCtx.room?.players ?? []` into `GameChatProvider` value — ONLY the one line inside the `<GameChatProvider value={...}>` literal at ~line 94 + its surrounding value object; do NOT touch anything else in App.tsx)
- **EDIT**: any existing test files in the EDITED components (`GameHeader.test.tsx`, `SidePanel.test.tsx`, `useGameLog.test.tsx`) ONLY to update prop shape if the added optional field requires it. No new test files outside `theme/`.

Everything else is OFF LIMITS. If you discover a bug elsewhere, note it in `docs/ISSUE_player-colors.md` under "Pre-existing issues surfaced".

## What to build

### Step 1 — `packages/game-ui/src/theme/playerColors.ts`

```ts
import type { PlayerInfo } from '@repo/shared';

export interface PlayerColor {
  /** CSS-safe token name for debugging / data attrs. */
  readonly token: string;
  /** Primary accent — strong border, dot indicator, glow. */
  readonly hex: string;
  /** Slightly darker variant for borders/rings on light backgrounds. */
  readonly border: string;
  /** Soft background tint (used for active-turn pill background, etc.). */
  readonly soft: string;
  /** High-contrast text color for player-name renders on soft backgrounds. */
  readonly text: string;
}

/**
 * 8-color palette covering TableCraft's player count range (2–16 across all
 * games; ≥8 wraps via modulo — intentional, acceptable visual collision at
 * the extreme). Colors chosen for color-blind-safe separation (simplex
 * distance ≥40 across red/green/blue axes) and for legibility on the
 * warm-skeuomorphic cream background. Order intentional: the first few
 * (red/blue/green/amber) are the highest-contrast pair-wise and land on
 * the most-used 2–4 player seats.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  { token: 'player-red',    hex: '#d94040', border: '#a82828', soft: '#fde8e8', text: '#7a1010' },
  { token: 'player-blue',   hex: '#2563eb', border: '#1947b8', soft: '#dbeafe', text: '#0a2d6e' },
  { token: 'player-green',  hex: '#16a34a', border: '#0d7537', soft: '#dcfce7', text: '#0d3a1d' },
  { token: 'player-amber',  hex: '#d97706', border: '#a05305', soft: '#fef3c7', text: '#5a2a00' },
  { token: 'player-purple', hex: '#7c3aed', border: '#5b1ec0', soft: '#ede9fe', text: '#2e0d6b' },
  { token: 'player-pink',   hex: '#db2777', border: '#a1195b', soft: '#fce7f3', text: '#5e0826' },
  { token: 'player-cyan',   hex: '#0891b2', border: '#056484', soft: '#cffafe', text: '#062a38' },
  { token: 'player-lime',   hex: '#65a30d', border: '#4c7a0a', soft: '#ecfccb', text: '#26380a' },
] as const;

export function getPlayerColor(seatIndex: number): PlayerColor {
  const n = PLAYER_COLORS.length;
  // Guard against negative / NaN seatIndex (shouldn't happen from PlayerInfo
  // but protect against unknown/fallback callers).
  if (!Number.isFinite(seatIndex) || seatIndex < 0) return PLAYER_COLORS[0];
  return PLAYER_COLORS[Math.floor(seatIndex) % n];
}

/**
 * Look up a player's color by their id. Returns null when the id is unknown
 * (e.g. system actor, left-the-room mid-match, or players list missing).
 */
export function getPlayerColorById(
  players: readonly PlayerInfo[] | undefined,
  id: string | undefined,
): PlayerColor | null {
  if (!id || !players || players.length === 0) return null;
  const p = players.find((x) => x.id === id);
  return p ? getPlayerColor(p.seatIndex) : null;
}
```

Then export the API from `packages/game-ui/src/theme/index.ts`:

```ts
export {
  PLAYER_COLORS,
  getPlayerColor,
  getPlayerColorById,
} from './playerColors';
export type { PlayerColor } from './playerColors';
```

Also add a re-export from the top-level package if it has one — check `packages/game-ui/package.json` `exports` field. If `./theme` isn't already exported, add it:

```json
"./theme": { "types": "./src/theme/index.ts", "default": "./src/theme/index.ts" }
```

### Step 2 — Unit test `playerColors.test.ts`

Exercise every branch. Use vitest (no React needed):

```ts
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, getPlayerColor, getPlayerColorById } from './playerColors';
import type { PlayerInfo } from '@repo/shared';

function makePlayer(id: string, seatIndex: number): PlayerInfo {
  return {
    id, name: id, seatIndex, ready: true, connected: true, isBot: false,
  };
}

describe('getPlayerColor', () => {
  it('returns distinct colors for the first N seats', () => {
    const colors = new Set<string>();
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      colors.add(getPlayerColor(i).hex);
    }
    expect(colors.size).toBe(PLAYER_COLORS.length);
  });

  it('wraps around via modulo when seatIndex exceeds palette size', () => {
    const n = PLAYER_COLORS.length;
    expect(getPlayerColor(n).hex).toBe(getPlayerColor(0).hex);
    expect(getPlayerColor(n + 3).hex).toBe(getPlayerColor(3).hex);
  });

  it('clamps negative / NaN seatIndex to the first color', () => {
    expect(getPlayerColor(-1).hex).toBe(PLAYER_COLORS[0].hex);
    expect(getPlayerColor(Number.NaN).hex).toBe(PLAYER_COLORS[0].hex);
  });

  it('floors fractional seatIndex', () => {
    expect(getPlayerColor(2.7).hex).toBe(PLAYER_COLORS[2].hex);
  });
});

describe('getPlayerColorById', () => {
  const players: PlayerInfo[] = [
    makePlayer('alice', 0),
    makePlayer('bob', 1),
    makePlayer('carol', 2),
  ];

  it('returns the color matching the player seatIndex', () => {
    expect(getPlayerColorById(players, 'bob')?.hex).toBe(PLAYER_COLORS[1].hex);
  });

  it('returns null for unknown id', () => {
    expect(getPlayerColorById(players, 'stranger')).toBeNull();
  });

  it('returns null for undefined id / empty list', () => {
    expect(getPlayerColorById(players, undefined)).toBeNull();
    expect(getPlayerColorById([], 'alice')).toBeNull();
    expect(getPlayerColorById(undefined, 'alice')).toBeNull();
  });
});
```

Run: `cd packages/game-ui && pnpm exec vitest run src/theme/playerColors.test.ts` — must be green before you proceed.

### Step 3 — Header: color the CompactPlayer chip and turn indicator

**File**: `packages/game-ui/src/header/GameHeader.tsx`

- Import `getPlayerColor` from the new theme module.
- **CompactPlayer component** (`~line 67-104`):
  - Compute `const color = getPlayerColor(player.seatIndex)` at the top of the component.
  - Replace the `AVATAR_COLORS` 5-color array passed to `<Avatar>` with `[color.hex]` — a single-element palette forces `boring-avatars` to use that color for the "primary" band. (Keep the `AVATAR_COLORS` constant itself declared for now in case other callers rely on it via re-render semantics; DO NOT delete the constant.)
    - Actually simpler: pass `colors={[color.hex, color.border, color.soft, color.text, color.hex]}` — 5 elements still, all derived from `color`, so the avatar feels like a monochrome-shaded glyph in that player's hue.
  - On the chip wrapper `<div>`:
    - When `isCurrentTurn`: swap the hardcoded `bg-[#fef3e0] border-warning` / `text-[#7a4006]` to use inline style / class with `color`:
      ```tsx
      style={isCurrentTurn ? { backgroundColor: color.soft, borderColor: color.border } : undefined}
      className={`flex items-center gap-1.5 rounded-[10px] px-1.5 py-0.5 border-2 transition-all ${
        isCurrentTurn ? 'shadow-button' : 'border-transparent bg-transparent'
      }`}
      ```
    - When NOT current turn but otherwise rendered: add a thin `border-2` with `color.border` at 60% opacity so players are always visually associated with their color — use inline style `borderColor: \`${color.border}99\`` (99 hex = ~60% alpha) and drop the `border-transparent`. Keep `bg-transparent`.
  - Name span text color: always `color.text` instead of `text-foreground` / `text-[#7a4006]`. Use inline style `color: color.text`.
- **Turn-indicator pill** (`~line 174-190`):
  - Compute `const currentColor = getPlayerColorById(players, currentPlayerId)` at the top of `GameHeader`.
  - Replace `bg-[#fef3e0] border-warning text-[#7a4006] ...` with `color.soft / color.border / color.text`, applied inline when `currentColor` is non-null.
  - Keep the animate-pulse behavior for self-turn (`isMyTurn`).
  - The dot inside: `bg-warning` / `bg-muted-foreground` → replace with `currentColor.hex` when available, fallback `bg-muted-foreground` otherwise.

Make both changes using inline `style` props for the dynamic hex values — **do NOT try to generate Tailwind class names like `bg-[${color.hex}]`** (the Tailwind JIT can't see dynamic template literals; classes won't be emitted). Static Tailwind classes (`shadow-button`, `border-2`, `rounded-[10px]`, etc.) stay as classes.

### Step 4 — LogContext + LogRow

**File**: `packages/game-ui/src/log/GameLogContext.tsx`

- Add optional `players?: readonly PlayerInfo[]` to `GameLogContextValue`.
- Extend `GameLogProvider` props with `players?: readonly PlayerInfo[]` (optional so existing tests that only pass `playerNames` stay green).
- Thread it through the `useMemo` of `value`.
- `playerNames` stays — it's still useful as a separate id→name map.

**File**: `packages/game-ui/src/side-panel/SidePanel.tsx` — `LogRow` component (~line 44):

- Import `getPlayerColorById` from `@repo/game-ui/theme`.
- Destructure `players` out of `useGameLog()` alongside `playerNames`.
- Compute `const actorColor = getPlayerColorById(players, entry.actorId)`.
- When `actorColor` is non-null:
  - Replace the left border color: use inline style `borderLeftColor: actorColor.hex` and keep `border-l-4` (upgrade from `border-l-2` to `border-l-4` for system/action/info ALIKE when we have a color — but only when actorColor is non-null; when null keep existing `border-l-2` and its token border color).
  - Render `actorDisplay` with inline `color: actorColor.text` and keep `font-semibold`.
- When `actorColor` is null: behave exactly as today.

### Step 5 — ChatContext + ChatPane

**File**: `packages/game-ui/src/chat/GameChatContext.tsx`

- Add optional `players?: readonly PlayerInfo[]` to `GameChatContextValue`.
- The graceful fallback `useGameChat()` returns `{ messages: [], send: () => {}, myId: '' }` — add `players: []` there too.

**File**: `packages/client/src/App.tsx`

- Locate the `<GameChatProvider value={...}>` at ~line 94. Extend the value object to include `players: roomCtx.room?.players ?? []`. That's the ONLY App.tsx edit.

**File**: `packages/game-ui/src/side-panel/SidePanel.tsx` — `ChatPane` component:

- Destructure `players` out of `useGameChat()`.
- For each non-mine message bubble, compute `const senderColor = getPlayerColorById(players, m.from)` once per message.
- Render the `fromName` label (the `<div className="text-[10px] text-muted-foreground mb-0.5 px-1">` at ~line 131) with inline `color: senderColor?.text ?? undefined` — still uses the muted-foreground class as a fallback.
- On the non-mine bubble (`bg-card border-2 border-foreground text-foreground`): when `senderColor` is non-null, replace `border-foreground` via inline `borderColor: senderColor.border` (2px). Keep `bg-card` + `text-foreground`. The bubble gets a colored border that's clearly associated with the sender.
- Mine bubbles stay unchanged (warm amber) — they're always "you" and don't need to be disambiguated among peers.

### Step 6 — Game.tsx — pass players into GameLogProvider

**File**: `packages/client/src/pages/Game.tsx`

At the `<GameLogProvider>` call (~line 96), add the new prop:

```tsx
<GameLogProvider defaultNs={room.gameId} playerNames={playerNames} players={room.players}>
```

Nothing else changes.

## NEGATIVE-SCENARIO acceptance (mandatory)

For each, explicitly verify:

- [ ] System log entries (no `actorId`): `actorColor` is null, rendering falls back to today's look (muted bg, border-l-2 token).
- [ ] Chat provider with `players: []` (lobby route, no room): `ChatPane` renders non-mine bubbles with the existing `border-foreground` fallback; no crashes.
- [ ] `seatIndex >= PLAYER_COLORS.length`: color wraps via modulo. Create a ≥9-player scenario in `GameHeader.test.tsx` ONLY if there's already a similar >N-player test; otherwise cover via the `playerColors.test.ts` unit you already wrote.
- [ ] Unknown player id in log (`actorId` pointing at a player who left the room): `getPlayerColorById` returns null; log row still renders; no crash.
- [ ] Existing tests (`GameHeader.test.tsx`, `SidePanel.test.tsx`, `useGameLog.test.tsx`) still pass without semantic changes. If you must touch them, the ONLY acceptable edits are: (a) adding the new optional prop to existing provider setups with `[]`, (b) adjusting one assertion if a previously-hardcoded `#fef3e0` color was asserted and is now dynamic.

## Validation (run these, in order, from the WORKTREE root `/Users/bytedance/Projects/tablecraft-worker-player-colors`)

```bash
# 1. Palette unit tests green
cd packages/game-ui && pnpm exec vitest run src/theme/playerColors.test.ts
cd ../..

# 2. game-ui full suite green
cd packages/game-ui && pnpm exec vitest run
cd ../..

# 3. Typecheck end-to-end
pnpm typecheck

# 4. Full test suite
pnpm test

# 5. i18n parity — should be zero diff since this task adds no keys
node -e "
const zh = require('./packages/client/src/i18n/locales/zh/common.json');
const en = require('./packages/client/src/i18n/locales/en/common.json');
function flat(o, p='', out={}) { for (const [k,v] of Object.entries(o)) {
  const kk = p ? p+'.'+k : k;
  if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, kk, out);
  else out[kk] = true;
} return out; }
const fz = Object.keys(flat(zh)).sort(), fe = Object.keys(flat(en)).sort();
const onlyZh = fz.filter(k => !fe.includes(k));
const onlyEn = fe.filter(k => !fz.includes(k));
console.log('zh-only:', onlyZh, 'en-only:', onlyEn);
if (onlyZh.length || onlyEn.length) process.exit(1);
"

# 6. Hardcode sweep — hex colors should NOT have spread
rg -n '#[0-9a-fA-F]{6}' packages/game-ui/src/header/GameHeader.tsx \
  packages/game-ui/src/side-panel/SidePanel.tsx
# Expect: the original #fef3e0 / #7a4006 / #7a1010 / etc. ONLY on mine-bubble
# paths (self-turn & self chat), no new hexes introduced in other places.

# 7. Visual smoke — confirm playerColors.ts is the single color source
rg -n 'PLAYER_COLORS|getPlayerColor' packages/game-ui/src packages/client/src
```

All seven must succeed before you report done.

## Deliverables

1. Code at declared paths, every new line traceable to spec above.
2. `pnpm typecheck` green.
3. `pnpm test` green (N/N passed).
4. Every file in "scope fence" either created, edited, or unchanged — nothing outside.
5. `docs/ISSUE_player-colors.md` with sections:
   - Implementation summary (what landed)
   - Design choices I made where prompt was silent (e.g. exact Avatar palette shape)
   - Deferred / future work (dark-game-surface variants, seatIndex-vs-identity stability, server-side color if email notifications land)
   - Pre-existing issues surfaced (if any)
   - Validation output (paste the 7 commands' outputs, trimmed)
6. Commit on the `worker/player-colors` branch (the branch you're already on):
   ```bash
   git add -A
   git diff --staged --stat
   git commit -m "feat(ui): unified 8-color player identity — header chip, turn pill, log row, chat bubble"
   ```
   DO NOT push. Orchestrator will review + merge.

START NOW.
