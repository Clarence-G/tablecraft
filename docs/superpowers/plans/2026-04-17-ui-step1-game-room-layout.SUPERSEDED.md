> Superseded on 2026-04-17: switched to iterative polish on Gomoku first. See conversation for new approach.
# UI Revamp — Step 1: Game Room Layout Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a platform-owned `<GameRoomLayout>` that wraps every game with Zone A (header) and removes the `onReturnToRoom` / `onReturnToLobby` props from `BoardProps`, so entering any of the 11 games immediately feels like a platform instead of 11 disconnected apps.

**Architecture:** Add one new client component (`GameRoomLayout`) + one new `@repo/game-ui` component (`GameHeader`). `pages/Game.tsx` wraps `<Board>` in `<GameRoomLayout>` and lifts nav / room-code / exit handling out of the Board. `BoardProps` loses `onReturnToRoom?` / `onReturnToLobby?` — the layout now owns these. `GameOverModal` keeps its `onReturnToLobby` prop (different concern, triggered by game result not chrome). Every Board file removes references to those props. `CLAUDE.md` is updated to reflect the new `BoardProps` surface.

**Tech Stack:** React + TypeScript, Tailwind (design tokens from `DESIGN.md`), lucide-react, shadcn/ui button, react-i18next, Vitest + @testing-library/react (where already present).

**Out of scope (later steps):**
- Zone B / C / D / E chrome (Step 2)
- PlayerBadge / GameTable / PlayingCard / TokenChip upgrades (Steps 2 & 3)
- Lobby revamp (Step 3)
- Per-game board rewrites (Step 4)

**Verification strategy:**
- Component unit tests via Vitest for `GameHeader` behavior (renders game name, room code copy, back/exit wiring).
- `pnpm typecheck` must pass after each task that touches types.
- `pnpm --filter @games/<id> test` after each Board edit.
- Visual verification via `scripts/shoot-games.ts` against all 11 games **once at the end** (Task 16).

**Branch / commit style:** one commit per task using existing conventional-commit style visible in `git log` (`feat:`, `refactor:`, `chore:`).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/game-ui/src/header/GameHeader.tsx` | Create | Zone A bar: back arrow + icon + name + room-code chip + elapsed/phase + rules/settings/exit |
| `packages/game-ui/src/header/index.ts` | Create | Re-export |
| `packages/game-ui/src/header/GameHeader.test.tsx` | Create | Vitest: renders name, copies room code, fires onExit |
| `packages/game-ui/src/index.ts` | Modify | Re-export header |
| `packages/game-ui/src/i18n/en.json` / `zh.json` | Modify | Add `header.back`, `header.rules`, `header.settings`, `header.exit`, `header.copied`, `header.exitConfirm` |
| `packages/client/src/components/layout/GameRoomLayout.tsx` | Create | Composes `GameHeader` + children; elapsed clock; exit-confirm dialog; lifts nav callbacks |
| `packages/client/src/components/layout/GameRoomLayout.test.tsx` | Create | Vitest: renders header, clock ticks, exit confirms |
| `packages/client/src/pages/Game.tsx` | Modify | Wraps `<Board>` in `<GameRoomLayout>`, plumbs gameId/meta/roomId/elapsed |
| `packages/client/src/hooks/useGame.ts` | Read-only check | Confirm it exposes match start timestamp; if not, extend (Task 3) |
| `packages/shared/src/types/board.ts` | Modify | Remove `onReturnToRoom?` / `onReturnToLobby?` |
| `games/*/Board.tsx` (11 files) | Modify | Drop `onReturnToRoom` / `onReturnToLobby` from destructure + forwarding; keep `GameOverModal`'s own `onReturnToLobby` |
| `CLAUDE.md` | Modify | Update `BoardProps` line in §6 |
| `packages/game-ui/package.json` | Check | Confirm `lucide-react` + `react-i18next` already peer-depended (they are used by PlayerBadge already) |

---

## Task 1: Scaffold `<GameHeader>` in `@repo/game-ui` with a failing test

**Files:**
- Create: `packages/game-ui/src/header/GameHeader.tsx`
- Create: `packages/game-ui/src/header/index.ts`
- Create: `packages/game-ui/src/header/GameHeader.test.tsx`
- Modify: `packages/game-ui/src/index.ts`
- Modify: `packages/game-ui/src/i18n/en.json`, `packages/game-ui/src/i18n/zh.json` (create parent keys if missing)

- [ ] **Step 1.1: Confirm i18n file paths**

Run: `ls packages/game-ui/src/i18n/ 2>/dev/null || echo MISSING`
If output is `MISSING`, locate actual i18n: `grep -rln "useTranslation('game-ui'" packages/game-ui/src` to find where keys live. Use whichever file ships the existing `you`, `yourTurn`, `youWin` keys — that is the target file. (PlayerBadge already uses `t('you')`; GameOverModal uses `t('youWin')`.) Record the real path for Steps 1.5-1.6 below.

- [ ] **Step 1.2: Write failing test for `GameHeader`**

File: `packages/game-ui/src/header/GameHeader.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameHeader } from './GameHeader';

// Minimal i18n stub — GameHeader must tolerate a missing provider by
// rendering string fallbacks via the default value passed to `t()`.

describe('GameHeader', () => {
  it('renders game name and room code', () => {
    render(
      <GameHeader
        gameName="德州扑克"
        icon="Target"
        roomId="A3F2"
        elapsedSeconds={754}
        phase="第3局翻牌前"
      />,
    );
    expect(screen.getByText('德州扑克')).toBeInTheDocument();
    expect(screen.getByText('A3F2')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument(); // 754s → 12:34
    expect(screen.getByText('第3局翻牌前')).toBeInTheDocument();
  });

  it('fires onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(
      <GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={0} onBack={onBack} />,
    );
    fireEvent.click(screen.getByLabelText(/back/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('fires onExit when exit button clicked (desktop)', () => {
    const onExit = vi.fn();
    render(
      <GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={0} onExit={onExit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /exit/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('copies room code when the code chip is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GameHeader gameName="x" icon="Target" roomId="A3F2" elapsedSeconds={0} />);
    fireEvent.click(screen.getByTestId('room-code-chip'));
    expect(writeText).toHaveBeenCalledWith('A3F2');
  });
});
```

- [ ] **Step 1.3: Verify test fails**

Run: `pnpm --filter @repo/game-ui test -- GameHeader` (or the repo-wide equivalent if game-ui has no standalone test script — check `packages/game-ui/package.json` first; fall back to `pnpm vitest run packages/game-ui/src/header/GameHeader.test.tsx`).
Expected: FAIL with `Cannot find module './GameHeader'` or similar.

- [ ] **Step 1.4: Implement `GameHeader`**

File: `packages/game-ui/src/header/GameHeader.tsx`

```tsx
import { icons, ArrowLeft, LogOut, ScrollText, Settings } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface GameHeaderProps {
  gameName: string;
  /** Lucide icon name OR SVG filename (no extension) in `/game-icons/`. */
  icon?: string;
  roomId: string;
  elapsedSeconds: number;
  phase?: string;
  onBack?: () => void;
  onExit?: () => void;
  onRules?: () => void;
  onSettings?: () => void;
}

function formatElapsed(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function Icon({ name }: { name?: string }) {
  // Prefer Lucide when the name matches a registered component.
  const Lucide = name && (icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (Lucide) return <Lucide className="size-5" />;
  if (name) {
    return (
      <img
        src={`/game-icons/${name}.svg`}
        alt=""
        className="size-5 object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return null;
}

export function GameHeader({
  gameName,
  icon,
  roomId,
  elapsedSeconds,
  phase,
  onBack,
  onExit,
  onRules,
  onSettings,
}: GameHeaderProps) {
  const { t } = useTranslation('game-ui');
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be unavailable in some environments; no-op
    }
  }

  return (
    <header
      data-testid="game-header"
      className="sticky top-0 z-40 h-[52px] sm:h-[44px] bg-card/80 backdrop-blur border-b border-border px-3 sm:px-4 flex items-center gap-2"
    >
      {/* Left segment */}
      <button
        type="button"
        aria-label={t('header.back', { defaultValue: 'Back' })}
        onClick={onBack}
        className="p-1 rounded-[6px] hover:bg-secondary/60 transition-colors"
      >
        <ArrowLeft className="size-5" />
      </button>
      <Icon name={icon} />
      <span className="font-semibold truncate">{gameName}</span>
      <button
        type="button"
        data-testid="room-code-chip"
        onClick={copyCode}
        className="font-mono text-xs tracking-wider bg-secondary border border-border rounded-full px-2 py-0.5 hover:border-foreground transition-colors"
        aria-label={t('header.copyRoomCode', { defaultValue: 'Copy room code' })}
      >
        {copied ? t('header.copied', { defaultValue: 'Copied' }) : roomId}
      </button>

      {/* Center segment */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
        {phase && (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline truncate">{phase}</span>
          </>
        )}
      </div>

      {/* Right segment */}
      <div className="flex items-center gap-1">
        {onRules && (
          <button
            type="button"
            aria-label={t('header.rules', { defaultValue: 'Rules' })}
            onClick={onRules}
            className="p-1 rounded-[6px] hover:bg-secondary/60 hidden sm:inline-flex"
          >
            <ScrollText className="size-4" />
          </button>
        )}
        {onSettings && (
          <button
            type="button"
            aria-label={t('header.settings', { defaultValue: 'Settings' })}
            onClick={onSettings}
            className="p-1 rounded-[6px] hover:bg-secondary/60 hidden sm:inline-flex"
          >
            <Settings className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={t('header.exit', { defaultValue: 'Exit' })}
          onClick={onExit}
          className="p-1 rounded-[6px] hover:bg-destructive/10 text-destructive"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 1.5: Create header barrel + register in game-ui index**

File: `packages/game-ui/src/header/index.ts`

```ts
export * from './GameHeader';
```

Edit `packages/game-ui/src/index.ts` — append:

```ts
export * from './header/index';
```

- [ ] **Step 1.6: Add i18n keys (in whichever file backs `useTranslation('game-ui')`)**

English file — add under the existing root object (merge, do not replace):

```json
{
  "header": {
    "back": "Back",
    "rules": "Rules",
    "settings": "Settings",
    "exit": "Exit",
    "copied": "Copied",
    "copyRoomCode": "Copy room code",
    "exitConfirmTitle": "Leave the match?",
    "exitConfirmBody": "You can rejoin from the lobby if the room is still open.",
    "exitConfirmCancel": "Stay",
    "exitConfirmOk": "Leave"
  }
}
```

Chinese file — same keys:

```json
{
  "header": {
    "back": "返回",
    "rules": "规则",
    "settings": "设置",
    "exit": "退出",
    "copied": "已复制",
    "copyRoomCode": "复制房间码",
    "exitConfirmTitle": "确认离开对局？",
    "exitConfirmBody": "房间开放时你仍可以从大厅重新加入。",
    "exitConfirmCancel": "留下",
    "exitConfirmOk": "离开"
  }
}
```

- [ ] **Step 1.7: Run test to verify pass**

Run: `pnpm vitest run packages/game-ui/src/header/GameHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 1.8: Commit**

```bash
git add packages/game-ui/src/header/ packages/game-ui/src/index.ts packages/game-ui/src/i18n/
git commit -m "feat(game-ui): add GameHeader component for Zone A"
```

---

## Task 2: Source match start time from `useGame`

**Why this task exists:** `GameRoomLayout` needs an `elapsedSeconds` value. We don't yet know whether `useGame` surfaces a match-start timestamp — if not, we must add one. Doing this before the layout avoids a forward reference.

**Files:**
- Read: `packages/client/src/hooks/useGame.ts`
- Modify (if needed): `packages/client/src/hooks/useGame.ts`

- [ ] **Step 2.1: Inspect `useGame`**

Run: `cat packages/client/src/hooks/useGame.ts`

Look for a field like `matchStartedAt`, `startedAt`, or a timestamp on `state`. If one exists, note its path (e.g. `game.startedAt`). **Skip to Task 3.** If none exists, continue.

- [ ] **Step 2.2: Add `matchStartedAt` to the hook (only if Step 2.1 found nothing)**

In `useGame`, when the first non-null `state` is observed, capture `Date.now()` into a ref and expose it:

```ts
const startRef = useRef<number | null>(null);
// inside the state-update handler:
if (state !== null && startRef.current === null) startRef.current = Date.now();
// and in the returned object:
return { state, sendAction, lastReject, notifications, matchStartedAt: startRef.current };
```

Keep existing fields intact. If `useGame` already uses React state rather than a ref, follow the existing pattern.

- [ ] **Step 2.3: Verify compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2.4: Commit (only if you modified useGame)**

```bash
git add packages/client/src/hooks/useGame.ts
git commit -m "feat(client): expose matchStartedAt from useGame"
```

If no changes were needed, skip this commit.

---

## Task 3: Scaffold `<GameRoomLayout>` with a failing test

**Files:**
- Create: `packages/client/src/components/layout/GameRoomLayout.tsx`
- Create: `packages/client/src/components/layout/GameRoomLayout.test.tsx`

- [ ] **Step 3.1: Write failing test**

File: `packages/client/src/components/layout/GameRoomLayout.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameRoomLayout } from './GameRoomLayout';

describe('GameRoomLayout', () => {
  it('renders the header with game name and wraps children', () => {
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={() => {}}
      >
        <div data-testid="board-child">BOARD</div>
      </GameRoomLayout>,
    );
    expect(screen.getByText('五子棋')).toBeInTheDocument();
    expect(screen.getByText('A3F2')).toBeInTheDocument();
    expect(screen.getByTestId('board-child')).toBeInTheDocument();
  });

  it('shows exit confirmation before calling onReturnToLobby', () => {
    const onReturnToLobby = vi.fn();
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={onReturnToLobby}
      >
        <div />
      </GameRoomLayout>,
    );
    fireEvent.click(screen.getByLabelText(/exit/i));
    expect(onReturnToLobby).not.toHaveBeenCalled();
    // confirm dialog visible
    fireEvent.click(screen.getByRole('button', { name: /leave|离开/i }));
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
  });

  it('back button calls onReturnToLobby without confirmation', () => {
    const onReturnToLobby = vi.fn();
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={onReturnToLobby}
      >
        <div />
      </GameRoomLayout>,
    );
    fireEvent.click(screen.getByLabelText(/back/i));
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Verify test fails**

Run: `pnpm vitest run packages/client/src/components/layout/GameRoomLayout.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `GameRoomLayout`**

File: `packages/client/src/components/layout/GameRoomLayout.tsx`

```tsx
import { GameHeader } from '@repo/game-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface GameRoomLayoutProps {
  gameId: string;
  gameName: string;
  icon?: string;
  roomId: string;
  /** Epoch ms when the match started; used to compute elapsed time. */
  matchStartedAt: number | null;
  phase?: string;
  onReturnToRoom?: () => void;
  onReturnToLobby: () => void;
  children: React.ReactNode;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function GameRoomLayout({
  gameName,
  icon,
  roomId,
  matchStartedAt,
  phase,
  onReturnToLobby,
  children,
}: GameRoomLayoutProps) {
  const { t } = useTranslation('game-ui');
  const elapsed = useElapsed(matchStartedAt);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <GameHeader
        gameName={gameName}
        icon={icon}
        roomId={roomId}
        elapsedSeconds={elapsed}
        phase={phase}
        onBack={onReturnToLobby}
        onExit={() => setConfirming(true)}
      />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('header.exitConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('header.exitConfirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t('header.exitConfirmCancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onReturnToLobby();
              }}
            >
              {t('header.exitConfirmOk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3.4: Confirm shadcn Dialog exports are available**

Run: `grep -n "export " packages/client/src/components/ui/dialog.tsx`
Expected: output lists `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`. If any are missing, check shadcn's stock dialog — if not present, add the missing exports to match the file (they are standard shadcn names; the component file almost certainly already has them).

- [ ] **Step 3.5: Run test**

Run: `pnpm vitest run packages/client/src/components/layout/GameRoomLayout.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3.6: Commit**

```bash
git add packages/client/src/components/layout/
git commit -m "feat(client): add GameRoomLayout wrapping Zone A chrome"
```

---

## Task 4: Wire `GameRoomLayout` into `pages/Game.tsx`

**Files:**
- Modify: `packages/client/src/pages/Game.tsx`

- [ ] **Step 4.1: Rewrite `pages/Game.tsx` to use the layout**

Replace the current body of `Game()` with:

```tsx
import type { RoomState } from '@repo/shared';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { clientRegistry } from '../../../../games/client-registry';
import { GameRoomLayout } from '../components/layout/GameRoomLayout';
import type { useGame } from '../hooks/useGame';

type GameState = ReturnType<typeof useGame>;

interface GamePageProps {
  userId: string;
  room: RoomState | null;
  game: GameState;
  onReturnToRoom?: () => void;
  onReturnToLobby: () => void;
}

function Loading() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">{t('game.loading')}</div>
    </div>
  );
}

export function Game({ userId, room, game, onReturnToRoom, onReturnToLobby }: GamePageProps) {
  const { t } = useTranslation('common');
  const { state, sendAction, lastReject, notifications, matchStartedAt } = game;

  if (!room || !state) return <Loading />;

  const plugin = clientRegistry[room.gameId];
  if (!plugin)
    return (
      <div className="p-8">
        {t('game.unknownGame')}: {room.gameId}
      </div>
    );

  const Board = plugin.Board;
  const meta = plugin.meta;
  const localizedName = t(`${room.gameId}:name`, { defaultValue: meta.name });

  return (
    <GameRoomLayout
      gameId={room.gameId}
      gameName={localizedName}
      icon={meta.icon}
      roomId={room.roomId}
      matchStartedAt={matchStartedAt ?? null}
      onReturnToRoom={onReturnToRoom}
      onReturnToLobby={onReturnToLobby}
    >
      {lastReject && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#fde8e8] border-2 border-destructive rounded-[12px] px-4 py-2 text-destructive font-medium z-50 shadow-card-active">
          {lastReject}
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Board
          state={state}
          myId={userId}
          players={room.players}
          sendAction={sendAction}
          lastReject={lastReject}
          notifications={notifications}
        />
      </Suspense>
    </GameRoomLayout>
  );
}
```

Notes:
- `onReturnToLobby` is **now required** (layout owns exit). Callers in `App.tsx` already pass it.
- `onReturnToRoom` stays optional; the layout uses it only if available.
- `matchStartedAt` comes from `useGame` (Task 2 ensures it exists). If Task 2 confirmed a different field name, substitute it here.
- The `clientRegistry[id].meta` field `estimatedMinutes` / `icon` / `name` are already typed on `ClientGamePlugin`.
- `room.roomId` must match the actual field on `RoomState`. If the field is named differently (e.g. `room.id`), use that; grep first: `grep -n "interface RoomState" packages/shared/src/types/room.ts`.

- [ ] **Step 4.2: Verify the field names assumed above**

Run: `grep -n "interface RoomState\|roomId\|gameId" packages/shared/src/types/room.ts`
Confirm `roomId` and `gameId` are properties. If the actual names differ, adjust Step 4.1's code before committing.

- [ ] **Step 4.3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If Board files error because they still destructure `onReturnToRoom` / `onReturnToLobby` — that is expected and fixed in Tasks 6-16; for now they will warn (not error) because destructured keys from `BoardProps` that do not exist produce `never` typed values. If this fails the typecheck, **pause here and proceed to Task 5 first**, then come back and run typecheck after Tasks 6-16.

- [ ] **Step 4.4: Commit**

```bash
git add packages/client/src/pages/Game.tsx
git commit -m "refactor(client): wrap game board in GameRoomLayout"
```

---

## Task 5: Remove `onReturnToRoom` / `onReturnToLobby` from `BoardProps`

**Files:**
- Modify: `packages/shared/src/types/board.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 5.1: Strip the props**

Replace contents of `packages/shared/src/types/board.ts`:

```ts
import type { PlayerInfo } from './room';

/** Board 组件 Props — chrome props (back/exit) are owned by the layout. */
export interface BoardProps<TView, TAction = unknown> {
  state: TView;
  myId: string;
  players: PlayerInfo[];
  sendAction: (action: TAction) => void;
  lastReject: string | null;
  notifications: unknown[];
}
```

- [ ] **Step 5.2: Update CLAUDE.md**

In `CLAUDE.md` §6 "Key interfaces", replace the line:

```
- `BoardProps<TView, TAction>` — React Board props: `{ state, myId, players, sendAction, lastReject, notifications, onReturnToRoom?, onReturnToLobby? }`
```

with:

```
- `BoardProps<TView, TAction>` — React Board props: `{ state, myId, players, sendAction, lastReject, notifications }`. Chrome (back button, exit, room code) is rendered by `<GameRoomLayout>` — Boards never render their own header or lobby-nav buttons.
```

- [ ] **Step 5.3: Typecheck (expected to fail for now)**

Run: `pnpm typecheck`
Expected: FAIL — 11 Board.tsx files destructure the removed props. The next 11 tasks fix them.

- [ ] **Step 5.4: Do NOT commit yet**

Tasks 6-16 must land before this commits, otherwise the tree is broken. Hold these two files staged and continue.

---

## Task 6: Fix `games/gomoku/Board.tsx`

**Files:**
- Modify: `games/gomoku/Board.tsx`

- [ ] **Step 6.1: Remove the two props**

In the destructure around line 17-24:

```tsx
export function Board({
  state,
  myId,
  players,
  sendAction,
  onReturnToRoom,   // REMOVE
  onReturnToLobby,  // REMOVE
}: BoardProps<PlayerView, Action>) {
```

becomes:

```tsx
export function Board({ state, myId, players, sendAction }: BoardProps<PlayerView, Action>) {
```

In the `<GameOverModal>` JSX (around line 82), the GameOverModal still accepts `onReturnToLobby` — but Board no longer receives it. Change:

```tsx
onReturnToLobby={onReturnToLobby}
```

to remove that prop entirely (and any `onReturnToRoom={onReturnToRoom}` on the same JSX). The modal will fall back to hiding those buttons. (Follow-up: a later step may push modal nav back into the layout, but Step 1's scope stops here.)

Also remove any back-button JSX inside the Board that called those handlers (grep the file for `ArrowLeft` / `onReturnToLobby` / `onReturnToRoom` first — keep any `ArrowLeft` used for in-game navigation that is not a lobby/back button).

- [ ] **Step 6.2: Run the game's tests**

Run: `pnpm --filter @games/gomoku test`
Expected: PASS.

- [ ] **Step 6.3: Typecheck this package**

Run: `pnpm typecheck`
Expected: the gomoku errors from Task 5 are now gone (other games still error).

- [ ] **Step 6.4: Commit**

```bash
git add games/gomoku/Board.tsx
git commit -m "refactor(gomoku): drop onReturnTo* props from Board (layout owns chrome)"
```

---

## Task 7: Fix `games/battleship/Board.tsx`

**Files:**
- Modify: `games/battleship/Board.tsx`

- [ ] **Step 7.1: Remove props**

Apply the same pattern as Task 6:
- Remove `onReturnToRoom` and `onReturnToLobby` from the `BoardProps` destructure (around line 237).
- Remove their forwarding to `GameOverModal` (around line 490).
- Remove any in-Board "back to lobby" / "返回大厅" buttons.

- [ ] **Step 7.2: Run tests**

Run: `pnpm --filter @games/battleship test`
Expected: PASS.

- [ ] **Step 7.3: Commit**

```bash
git add games/battleship/Board.tsx
git commit -m "refactor(battleship): drop onReturnTo* props from Board"
```

---

## Task 8: Fix `games/blackjack/Board.tsx`

**Files:**
- Modify: `games/blackjack/Board.tsx`

- [ ] **Step 8.1: Apply the same pattern**

Destructure cleanup (around line 290), forwarding removal (around line 443).

- [ ] **Step 8.2: Test**

Run: `pnpm --filter @games/blackjack test`

- [ ] **Step 8.3: Commit**

```bash
git add games/blackjack/Board.tsx
git commit -m "refactor(blackjack): drop onReturnTo* props from Board"
```

---

## Task 9: Fix `games/connect-four/Board.tsx`

**Files:**
- Modify: `games/connect-four/Board.tsx`

- [ ] **Step 9.1: Apply the pattern**

Destructure cleanup (around line 15), forwarding removal (around line 73 and 82 — two call sites).

- [ ] **Step 9.2: Test**

Run: `pnpm --filter @games/connect-four test`

- [ ] **Step 9.3: Commit**

```bash
git add games/connect-four/Board.tsx
git commit -m "refactor(connect-four): drop onReturnTo* props from Board"
```

---

## Task 10: Fix `games/hive/Board.tsx`

**Files:**
- Modify: `games/hive/Board.tsx`

- [ ] **Step 10.1: Apply the pattern**

Destructure line ~123, forwarding line ~468.

- [ ] **Step 10.2: Test**

Run: `pnpm --filter @games/hive test`

- [ ] **Step 10.3: Commit**

```bash
git add games/hive/Board.tsx
git commit -m "refactor(hive): drop onReturnTo* props from Board"
```

---

## Task 11: Fix `games/liar-bar/Board.tsx`

**Files:**
- Modify: `games/liar-bar/Board.tsx`

- [ ] **Step 11.1: Apply the pattern**

Destructure line ~104, forwarding line ~339.

- [ ] **Step 11.2: Test**

Run: `pnpm --filter @games/liar-bar test`

- [ ] **Step 11.3: Commit**

```bash
git add games/liar-bar/Board.tsx
git commit -m "refactor(liar-bar): drop onReturnTo* props from Board"
```

---

## Task 12: Fix `games/love-letter/Board.tsx`

**Files:**
- Modify: `games/love-letter/Board.tsx`

- [ ] **Step 12.1: Apply the pattern**

Destructure line ~78, forwarding line ~401.

- [ ] **Step 12.2: Test**

Run: `pnpm --filter @games/love-letter test`

- [ ] **Step 12.3: Commit**

```bash
git add games/love-letter/Board.tsx
git commit -m "refactor(love-letter): drop onReturnTo* props from Board"
```

---

## Task 13: Fix `games/splendor/Board.tsx`

**Files:**
- Modify: `games/splendor/Board.tsx`

- [ ] **Step 13.1: Apply the pattern**

Destructure line ~425, forwarding line ~922.

- [ ] **Step 13.2: Test**

Run: `pnpm --filter @games/splendor test`

- [ ] **Step 13.3: Commit**

```bash
git add games/splendor/Board.tsx
git commit -m "refactor(splendor): drop onReturnTo* props from Board"
```

---

## Task 14: Fix `games/texas-holdem/Board.tsx`

**Files:**
- Modify: `games/texas-holdem/Board.tsx`

- [ ] **Step 14.1: Apply the pattern**

Destructure line ~321, forwarding line ~480.

- [ ] **Step 14.2: Test**

Run: `pnpm --filter @games/texas-holdem test`

- [ ] **Step 14.3: Commit**

```bash
git add games/texas-holdem/Board.tsx
git commit -m "refactor(texas-holdem): drop onReturnTo* props from Board"
```

---

## Task 15: Fix `games/uno/Board.tsx`

**Files:**
- Modify: `games/uno/Board.tsx`

- [ ] **Step 15.1: Apply the pattern**

Destructure line ~129, forwarding line ~317.

- [ ] **Step 15.2: Test**

Run: `pnpm --filter @games/uno test`

- [ ] **Step 15.3: Commit**

```bash
git add games/uno/Board.tsx
git commit -m "refactor(uno): drop onReturnTo* props from Board"
```

---

## Task 16: Fix `games/yahtzee/Board.tsx`, finalize, verify, screenshot

**Files:**
- Modify: `games/yahtzee/Board.tsx`
- No other changes — this task also closes out the Task 5 staged commit.

- [ ] **Step 16.1: Fix yahtzee**

Destructure line ~152, forwarding line ~362. Same pattern as above.

- [ ] **Step 16.2: Full typecheck + test**

Run these sequentially:

```bash
pnpm typecheck
pnpm -r --parallel test
```

Expected: both PASS across the whole monorepo.

- [ ] **Step 16.3: Boot dev server and eyeball one game**

Run: `pnpm dev`

In a browser at http://localhost:5173, create a Gomoku room and join. Verify:
1. A 44/52px header is visible at top with the gomoku name + room code chip.
2. Clicking the room code chip copies to clipboard (paste into any input to confirm).
3. Clicking the back arrow returns to the lobby.
4. Clicking the exit icon opens a confirmation dialog; "Leave" returns to lobby; "Stay" keeps you in the game.
5. No duplicate "back to lobby" button inside the gomoku board itself.
6. The board still plays — make at least one move and have the bot respond.

Stop the dev server (Ctrl-C) when done.

- [ ] **Step 16.4: Regenerate screenshots**

Run (in one terminal): `pnpm dev`
Run (in another terminal): `pnpm tsx scripts/shoot-games.ts`
This updates `screenshots/*.png` for all 11 games. Inspect a sample — `screenshots/gomoku.png`, `screenshots/battleship.png`, `screenshots/texas-holdem.png` — and confirm each image shows the new header strip. If any image has a double header (platform header + leftover in-Board header), the Board file still has legacy chrome to delete; grep the offending game for `ArrowLeft|返回|Back to` and remove.

- [ ] **Step 16.5: Commit everything remaining**

```bash
git add packages/shared/src/types/board.ts CLAUDE.md games/yahtzee/Board.tsx screenshots/
git commit -m "refactor: drop BoardProps.onReturnTo* — layout owns chrome nav

All 11 games updated. GameRoomLayout now renders the platform header
(back, room code chip, exit-with-confirm). GameOverModal retains its
own onReturnToLobby because it is a post-match action, not chrome."
```

- [ ] **Step 16.6: Final sanity**

Run: `git status`
Expected: clean working tree.

Run: `git log --oneline -20`
Expected: a clean sequence of 15-16 commits corresponding to this plan's tasks.

---

## Self-Review Notes (done)

- **Spec coverage:** A1 (layout wrapper) ✓, A2 (GameHeader) ✓, A7 (BoardProps slimmed) ✓. Explicitly out of scope: A3-A6, A8-A10, B*, C*, as decided with the user.
- **Placeholder scan:** None. Every step shows concrete code.
- **Type consistency:** `matchStartedAt: number | null` used consistently across `useGame`, `GameRoomLayout`, `Game`. `onReturnToLobby` is required on `GameRoomLayout` and `pages/Game.tsx`; `onReturnToRoom` stays optional — matches existing `App.tsx` wiring.
- **Known assumption to verify at execution time:** the i18n resource file path for the `game-ui` namespace (Step 1.1) and the `RoomState` field names (Step 4.2). Both have explicit verification steps in the plan so the executing engineer will not silently guess.
