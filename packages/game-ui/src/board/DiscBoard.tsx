/**
 * DiscBoard — a column-drop grid board (Connect Four style).
 * Renders a wood-grain grid of inset holes; filled holes show a glossy piece
 * (radial gradient + specular highlight) using --piece-red / --piece-yellow tokens.
 */

import { useMemo, useState } from 'react';

/** Two-player color tokens from the design system */
export const PLAYER_DISC_COLORS: [string, string] = ['var(--piece-red)', 'var(--piece-yellow)'];

export const PLAYER_DISC_BG: [string, string] = ['bg-piece-red', 'bg-piece-yellow'];

export const PLAYER_DISC_BG_GHOST: [string, string] = ['bg-piece-red/40', 'bg-piece-yellow/40'];

/** Radial-gradient fills used by pieces inside the board. The light highlight
 *  is biased to the top-left to read as a specular reflection. */
const PLAYER_DISC_FILL: [string, string] = [
  'radial-gradient(circle at 30% 30%, #ff8a8a 0%, var(--piece-red) 45%, #8c1e1e 100%)',
  'radial-gradient(circle at 30% 30%, #ffd78a 0%, var(--piece-yellow) 45%, #7a4006 100%)',
];

/** Ghost (hover preview) uses a softer, less saturated fill so it reads as a
 *  preview rather than a placed piece. */
const PLAYER_DISC_GHOST_FILL: [string, string] = [
  'radial-gradient(circle at 30% 30%, rgba(255,138,138,0.6) 0%, rgba(217,64,64,0.4) 60%, rgba(140,30,30,0.4) 100%)',
  'radial-gradient(circle at 30% 30%, rgba(255,215,138,0.6) 0%, rgba(217,119,6,0.4) 60%, rgba(122,64,6,0.4) 100%)',
];

interface DiscBoardProps {
  rows: number;
  cols: number;
  /** Flat array length rows*cols. 0=empty, 1=player0, 2=player1 */
  board: number[];
  /** Index (0 or 1) of the local player, for ghost preview color */
  myPlayerIndex: number;
  /** Whether it is the local player's turn */
  canPlay: boolean;
  onColumnClick: (col: number) => void;
  /** Optional: show winning cell highlight */
  winningCells?: Set<number>;
  /** Returns the accessible label for clickable cells in a given column (0-indexed). */
  getColumnAriaLabel?: (col: number) => string;
}

function findGhostRow(board: number[], rows: number, cols: number, col: number): number | null {
  for (let row = rows - 1; row >= 0; row--) {
    if (board[row * cols + col] === 0) return row;
  }
  return null;
}

export function DiscBoard({
  rows,
  cols,
  board,
  myPlayerIndex,
  canPlay,
  onColumnClick,
  winningCells,
  getColumnAriaLabel = (col) => `Drop in column ${col + 1}`,
}: DiscBoardProps) {
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const ghostRow = hoverCol !== null && canPlay ? findGhostRow(board, rows, cols, hoverCol) : null;

  // Lowest empty row per column: the piece would land here, and it is the keyboard focus target.
  const lowestEmptyByCol = useMemo(
    () => Array.from({ length: cols }, (_, col) => findGhostRow(board, rows, cols, col)),
    [board, rows, cols],
  );

  return (
    <div
      className="disc-board border-2 border-foreground rounded-[12px] p-2 shadow-[4px_4px_0px_0px_#3d2e1e] select-none"
      onMouseLeave={() => setHoverCol(null)}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-1 mb-1 last:mb-0">
          {Array.from({ length: cols }, (_, col) => {
            const idx = row * cols + col;
            const cellValue = board[idx];
            const isEmpty = cellValue === 0;
            const colLandingRow = lowestEmptyByCol[col];
            // A cell is clickable when it is empty and the column is not full and it is the player's turn.
            const isPlayable = canPlay && isEmpty && colLandingRow !== null;
            // Only the lowest empty cell per column receives focus via Tab (one tab stop per column).
            const isFocusTarget = isPlayable && colLandingRow === row;
            const isGhost = ghostRow === row && hoverCol === col && isEmpty;
            const isWinning = winningCells?.has(idx);

            let discStyle: React.CSSProperties | undefined;
            let discClass = '';
            if (cellValue === 1 || cellValue === 2) {
              discStyle = { background: PLAYER_DISC_FILL[cellValue - 1] };
              discClass = isWinning ? 'ring-2 ring-foreground' : '';
            } else if (isGhost) {
              discStyle = { background: PLAYER_DISC_GHOST_FILL[myPlayerIndex] };
            }

            const hasDisc = cellValue !== 0 || isGhost;
            const discContent = hasDisc && (
              <div
                className={`disc-piece ${discClass}`}
                style={{
                  ...discStyle,
                  ...(cellValue !== 0 ? { animation: 'discDrop 0.2s ease-out' } : undefined),
                }}
              />
            );

            // Holes are recessed into the board — darker fill + inset shadow.
            const baseClass =
              'disc-hole w-[clamp(44px,6vw,64px)] aspect-square rounded-full flex items-center justify-center';

            if (isPlayable) {
              return (
                <button
                  key={col}
                  type="button"
                  className={`${baseClass} cursor-pointer`}
                  tabIndex={isFocusTarget ? 0 : -1}
                  aria-label={getColumnAriaLabel(col)}
                  onClick={() => onColumnClick(col)}
                  onMouseEnter={() => setHoverCol(col)}
                >
                  {discContent}
                </button>
              );
            }

            return (
              <div key={col} className={baseClass}>
                {discContent}
              </div>
            );
          })}
        </div>
      ))}

      <style>{`
        .disc-board {
          background-color: #9a6b3a;
          background-image:
            repeating-linear-gradient(
              92deg,
              rgba(255, 236, 200, 0.08) 0 1px,
              transparent 1px 3px,
              rgba(61, 30, 10, 0.10) 3px 4px,
              transparent 4px 9px
            ),
            repeating-linear-gradient(
              88deg,
              rgba(0, 0, 0, 0.06) 0 2px,
              transparent 2px 14px
            ),
            radial-gradient(ellipse at 30% 20%, rgba(255, 220, 170, 0.18), transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(40, 20, 5, 0.22), transparent 65%);
        }
        .disc-hole {
          background: #6b4a26;
          box-shadow:
            inset 2px 2px 3px rgba(0, 0, 0, 0.55),
            inset -1px -1px 2px rgba(255, 220, 170, 0.12);
        }
        .disc-piece {
          width: 95%;
          height: 95%;
          border-radius: 9999px;
          box-shadow:
            inset -2px -2px 4px rgba(0, 0, 0, 0.35),
            inset 2px 2px 4px rgba(255, 255, 255, 0.25),
            0 1px 2px rgba(0, 0, 0, 0.4);
        }
        @keyframes discDrop {
          from { transform: translateY(-200%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
