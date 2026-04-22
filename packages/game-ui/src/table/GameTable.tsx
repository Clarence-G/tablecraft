import type { SurfaceKind } from '@repo/shared';
import type { ReactNode } from 'react';

export type { SurfaceKind };

export interface GameTableProps {
  /** Surface kind - determines the backdrop color + subtle texture. */
  surface?: SurfaceKind;
  /** Optional extra classes on the play-area container. */
  className?: string;
  children: ReactNode;
}

/**
 * Full-height container for Zone C (the play surface).
 *
 * Sits INSIDE the GameRoomLayout flex column. Claims all remaining vertical
 * space, provides a tinted backdrop + subtle grid / ripple / grain pattern per
 * surface, and hosts the game's centered content.
 *
 * Intentionally does NOT apply the surface to the full viewport -- the Header
 * must stay on its own cream card background.
 */
const SURFACE_BG: Record<SurfaceKind, string> = {
  cream: 'bg-cream text-foreground',
  felt: 'bg-felt text-card',
  water: 'bg-water text-card',
  wood: 'bg-wood text-foreground',
  marble: 'bg-marble text-foreground',
  parchment: 'bg-parchment text-foreground',
};

const SURFACE_PATTERN: Record<SurfaceKind, React.CSSProperties> = {
  cream: {
    backgroundImage:
      'radial-gradient(circle at 50% 0%, rgba(61,46,30,0.04), transparent 55%), repeating-linear-gradient(0deg, rgba(61,46,30,0.015) 0 1px, transparent 1px 3px)',
  },
  felt: {
    backgroundImage:
      'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.05), transparent 60%), repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 6px)',
  },
  water: {
    backgroundImage:
      'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08), transparent 55%), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 40px)',
  },
  wood: {
    backgroundImage:
      'repeating-linear-gradient(90deg, rgba(61,46,30,0.06) 0 1px, transparent 1px 7px), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), transparent 55%)',
  },
  marble: {
    backgroundImage:
      'radial-gradient(circle at 20% 20%, rgba(61,46,30,0.04), transparent 60%), radial-gradient(circle at 80% 80%, rgba(61,46,30,0.04), transparent 60%)',
  },
  parchment: {
    backgroundImage:
      'radial-gradient(circle at 50% 0%, rgba(122,64,6,0.06), transparent 60%), repeating-linear-gradient(0deg, rgba(122,64,6,0.02) 0 1px, transparent 1px 3px)',
  },
};

export function GameTable({ surface = 'cream', className, children }: GameTableProps) {
  return (
    <div
      data-testid="game-table"
      data-surface={surface}
      className={`flex-1 min-h-0 relative flex flex-col ${SURFACE_BG[surface]} ${className ?? ''}`}
      style={SURFACE_PATTERN[surface]}
    >
      {children}
    </div>
  );
}
