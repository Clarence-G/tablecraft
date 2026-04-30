import type { ReactNode } from 'react';

export interface GameTableProps {
  /** Optional extra classes on the play-area container. */
  className?: string;
  children: ReactNode;
}

/**
 * Full-height container for Zone C (the play surface).
 *
 * Sits INSIDE the GameRoomLayout flex column. Claims all remaining vertical
 * space and hosts the game's content. The visual backdrop (base color,
 * texture, ambience) is rendered by the inner `<GameScene>` — see
 * `packages/game-ui/src/scene/GameScene.tsx`. This wrapper intentionally
 * draws no background so games without a `scene` config fall through to the
 * platform cream.
 */
export function GameTable({ className, children }: GameTableProps) {
  return (
    <div
      data-testid="game-table"
      className={`flex-1 min-h-0 relative flex flex-col ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
