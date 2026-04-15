import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useState } from 'react';

export type Stone = 'black' | 'white';

export interface IntersectionBoardProps {
  /** Board size: 15 for gomoku, 19 for go, 9 for mini-go, etc. */
  size: number;
  /** 2D array of stones. stones[row][col] */
  stones: (Stone | null)[][];
  /** Star point coordinates, e.g. [[3,3],[7,7]] */
  starPoints?: [number, number][];
  /** Called when a cell is clicked */
  onPlace?: (row: number, col: number) => void;
  /** Return true if the cell is a valid placement target */
  canPlace?: (row: number, col: number) => boolean;
  /** Stone color to show on hover preview. Pass undefined to disable preview. */
  previewStone?: Stone;
  /** Render extra content on top of a cell (e.g. territory markers in Go) */
  renderOverlay?: (row: number, col: number) => ReactNode;
  className?: string;
}

/** Ideal cell size used for the SVG coordinate system. Actual size scales via viewBox. */
const CELL = 36;

function StoneView({ stone }: { stone: Stone }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`w-[77%] aspect-square rounded-full shadow-sm shadow-black/30 ${
        stone === 'black'
          ? 'bg-background border border-border'
          : 'bg-white border border-white/30'
      }`}
    />
  );
}

export function IntersectionBoard({
  size,
  stones,
  starPoints,
  onPlace,
  canPlace,
  previewStone,
  renderOverlay,
  className,
}: IntersectionBoardProps) {
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const boardPx = size * CELL;

  return (
    <div
      className={`bg-board rounded-lg shadow-lg shadow-black/20 ${className ?? ''}`}
      style={{
        padding: 'clamp(8px, 2vw, 18px)',
        width: `min(${boardPx + 36}px, calc(100vw - 32px))`,
        aspectRatio: '1',
      }}
    >
      <div className="relative w-full h-full">
        {/* Grid lines */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${boardPx} ${boardPx}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: 'none' }}
        >
          {Array.from({ length: size }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: grid lines are positionally stable
            <g key={i}>
              <line
                x1={i * CELL + CELL / 2}
                y1={CELL / 2}
                x2={i * CELL + CELL / 2}
                y2={(size - 0.5) * CELL}
                stroke="var(--board-line)"
                strokeWidth="1"
              />
              <line
                x1={CELL / 2}
                y1={i * CELL + CELL / 2}
                x2={(size - 0.5) * CELL}
                y2={i * CELL + CELL / 2}
                stroke="var(--board-line)"
                strokeWidth="1"
              />
            </g>
          ))}
          {starPoints?.map(([r, c]) => (
            <circle
              key={`${r}-${c}`}
              cx={c * CELL + CELL / 2}
              cy={r * CELL + CELL / 2}
              r="3"
              fill="var(--board-line)"
            />
          ))}
        </svg>

        {/* Interactive cells */}
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateRows: `repeat(${size}, 1fr)`,
            gridTemplateColumns: `repeat(${size}, 1fr)`,
          }}
        >
          {stones.map((row, r) =>
            row.map((cell, c) => {
              const placeable = canPlace?.(r, c) ?? false;
              const isHovered = hovered?.[0] === r && hovered?.[1] === c;
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are stable positional keys
                  key={`${r}-${c}`}
                  className="flex items-center justify-center bg-transparent border-none p-0 relative"
                  style={{ cursor: placeable ? 'pointer' : 'default' }}
                  disabled={!placeable}
                  onClick={() => placeable && onPlace?.(r, c)}
                  onMouseEnter={() => placeable && setHovered([r, c])}
                  onMouseLeave={() => setHovered(null)}
                  data-row={r}
                  data-col={c}
                  aria-label={`${r + 1},${c + 1}${cell ? ` (${cell})` : ''}`}
                >
                  <AnimatePresence>
                    {cell && <StoneView key={`s-${r}-${c}`} stone={cell} />}
                    {!cell && isHovered && previewStone && (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        className={`w-[77%] aspect-square rounded-full ${
                          previewStone === 'black' ? 'bg-background' : 'bg-white'
                        }`}
                      />
                    )}
                  </AnimatePresence>
                  {renderOverlay?.(r, c)}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
