/**
 * DiscBoard — a column-drop grid board (Connect Four style).
 * Renders a grid of circular cells with hover-preview and drop animation.
 * Player colors are passed via the PLAYER_DISC_COLORS token array.
 */

import { useState } from 'react';

/** Two-player color tokens from the design system */
export const PLAYER_DISC_COLORS: [string, string] = [
  '#d94040', // Dice Red — player 0
  '#d97706', // Amber Gold — player 1
];

export const PLAYER_DISC_BG: [string, string] = ['bg-[#d94040]', 'bg-[#d97706]'];

export const PLAYER_DISC_BG_GHOST: [string, string] = ['bg-[#d94040]/40', 'bg-[#d97706]/40'];

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
}: DiscBoardProps) {
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const ghostRow = hoverCol !== null && canPlay ? findGhostRow(board, rows, cols, hoverCol) : null;

  return (
    <div
      className="bg-card border-2 border-foreground rounded-[12px] p-2 shadow-[4px_4px_0px_0px_#3d2e1e] select-none"
      onMouseLeave={() => setHoverCol(null)}
    >
      {/* Column hover zones */}
      <div className="flex gap-1 mb-1">
        {Array.from({ length: cols }, (_, col) => (
          <button
            key={col}
            type="button"
            className="flex-1 h-5 flex items-center justify-center cursor-pointer disabled:cursor-default"
            disabled={!canPlay}
            onClick={() => onColumnClick(col)}
            onMouseEnter={() => setHoverCol(col)}
            aria-label={`Drop in column ${col + 1}`}
          >
            {hoverCol === col && canPlay && ghostRow !== null && (
              <div className={`w-2 h-2 rounded-full ${PLAYER_DISC_BG[myPlayerIndex]}`} />
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-1 mb-1 last:mb-0">
          {Array.from({ length: cols }, (_, col) => {
            const idx = row * cols + col;
            const cellValue = board[idx];
            const isGhost = ghostRow === row && hoverCol === col && cellValue === 0;
            const isWinning = winningCells?.has(idx);

            let discClass = '';
            if (cellValue === 1) {
              discClass = `${PLAYER_DISC_BG[0]} ${isWinning ? 'ring-2 ring-foreground' : ''}`;
            } else if (cellValue === 2) {
              discClass = `${PLAYER_DISC_BG[1]} ${isWinning ? 'ring-2 ring-foreground' : ''}`;
            } else if (isGhost) {
              discClass = PLAYER_DISC_BG_GHOST[myPlayerIndex];
            }

            return (
              <div
                key={col}
                className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center"
              >
                {(cellValue !== 0 || isGhost) && (
                  <div
                    className={`w-8 h-8 rounded-full transition-colors ${discClass}`}
                    style={cellValue !== 0 ? { animation: 'discDrop 0.2s ease-out' } : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <style>{`
        @keyframes discDrop {
          from { transform: translateY(-200%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
