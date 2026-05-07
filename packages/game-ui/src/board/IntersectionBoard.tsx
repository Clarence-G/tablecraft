import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useIsTouchViewport } from '../hooks/useIsTouchViewport';

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
  /** Show column letters + row numbers in the gutters (Go/Gomoku convention). */
  showCoordinates?: boolean;
  /** Disable all placement (e.g. while an action is in flight). Hides preview. */
  disabled?: boolean;
  className?: string;
}

/** Ideal cell size used for the SVG coordinate system. Actual size scales via viewBox. */
const CELL = 36;
/** Extra SVG space reserved on each side for coordinate labels when enabled. */
const LABEL_GUTTER = 18;

/** Go/Gomoku column letter — A, B, C, D, E, F, G, H, J (skip I), K, L, M, N, O, P, ... */
function columnLetter(i: number): string {
  // Skip 'I' to avoid confusion with '1' (Go standard).
  const base = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  return base[i] ?? String(i + 1);
}

function StoneView({ stone }: { stone: Stone }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`w-[77%] aspect-square rounded-full ${
        stone === 'black'
          ? 'bg-[#1a1108] border-2 border-[#3d2e1e] shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
          : 'bg-white border-2 border-[#c4b8a8] shadow-[0_2px_4px_rgba(0,0,0,0.15)]'
      }`}
    />
  );
}

function ConfirmChip({
  row,
  col,
  size,
  onConfirm,
  onCancel,
}: {
  row: number;
  col: number;
  size: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const coord = `${columnLetter(col)}${size - row}`;
  return (
    <div
      data-testid="confirm-chip"
      className="absolute flex items-center gap-1 bg-card border-2 border-foreground shadow-card-active rounded-[8px] px-2 py-1 z-10"
      style={{ top: 8, right: 8 }}
    >
      <span className="text-foreground font-semibold text-sm whitespace-nowrap">
        放在 {coord}？
      </span>
      <button
        type="button"
        className="flex items-center justify-center min-h-11 min-w-11 rounded-[8px] border-2 border-foreground bg-card shadow-card-active"
        onClick={onConfirm}
        aria-label="确认"
      >
        <Check size={16} />
      </button>
      <button
        type="button"
        className="flex items-center justify-center min-h-11 min-w-11 rounded-[8px] border-2 border-foreground bg-card shadow-card-active"
        onClick={onCancel}
        aria-label="取消"
      >
        <X size={16} />
      </button>
    </div>
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
  showCoordinates,
  disabled,
  className,
}: IntersectionBoardProps) {
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const [armed, setArmed] = useState<[number, number] | null>(null);
  const armedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouch = useIsTouchViewport();

  const boardPx = size * CELL;
  const gutter = showCoordinates ? LABEL_GUTTER : 0;
  const svgSize = boardPx + 2 * gutter;
  const insetPct = gutter === 0 ? '0' : `${(gutter / svgSize) * 100}%`;

  const clearArmed = () => {
    setArmed(null);
    if (armedTimeoutRef.current) {
      clearTimeout(armedTimeoutRef.current);
      armedTimeoutRef.current = null;
    }
  };

  const armCell = (r: number, c: number) => {
    if (armedTimeoutRef.current) clearTimeout(armedTimeoutRef.current);
    setArmed([r, c]);
    armedTimeoutRef.current = setTimeout(() => {
      setArmed(null);
      armedTimeoutRef.current = null;
    }, 4000);
  };

  const handleCellClick = (r: number, c: number) => {
    if (!isTouch) {
      onPlace?.(r, c);
      return;
    }
    if (armed && armed[0] === r && armed[1] === c) {
      clearArmed();
      onPlace?.(r, c);
      return;
    }
    armCell(r, c);
  };

  // Clear armed state when board is disabled
  useEffect(() => {
    if (disabled) clearArmed();
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (armedTimeoutRef.current) clearTimeout(armedTimeoutRef.current);
    };
  }, []);

  return (
    <div
      className={`bg-board rounded-[10px] border-2 border-foreground shadow-card overflow-hidden ${className ?? ''}`}
      style={{
        width: '100%',
        maxWidth: `${svgSize + 10}px`,
        aspectRatio: '1',
      }}
    >
      <div className="relative w-full h-full">
        {/* Grid lines + labels */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
          viewBox={`${-gutter} ${-gutter} ${svgSize} ${svgSize}`}
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
          {showCoordinates &&
            Array.from({ length: size }, (_, i) => {
              const letter = columnLetter(i);
              const rowNumber = String(size - i); // Go convention: 1 at bottom
              const linePos = i * CELL + CELL / 2;
              // Label sits at the visual middle of the full wood band (outer edge to first grid line).
              // Band spans from -gutter to CELL/2, so its center is (CELL/2 - gutter) / 2.
              const topY = (CELL / 2 - gutter) / 2;
              const bottomY = boardPx - (CELL / 2 - gutter) / 2;
              const leftX = (CELL / 2 - gutter) / 2;
              const rightX = boardPx - (CELL / 2 - gutter) / 2;
              return (
                <g
                  key={`lbl-${letter}-${rowNumber}`}
                  fill="var(--board-line)"
                  fontSize="12"
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontFamily: 'inherit', letterSpacing: '0.02em', opacity: 0.72 }}
                >
                  <text x={linePos} y={topY}>
                    {letter}
                  </text>
                  <text x={linePos} y={bottomY}>
                    {letter}
                  </text>
                  <text x={leftX} y={linePos}>
                    {rowNumber}
                  </text>
                  <text x={rightX} y={linePos}>
                    {rowNumber}
                  </text>
                </g>
              );
            })}
        </svg>

        {/* Interactive cells */}
        <div
          className="absolute grid"
          style={{
            inset: insetPct,
            gridTemplateRows: `repeat(${size}, 1fr)`,
            gridTemplateColumns: `repeat(${size}, 1fr)`,
          }}
        >
          {stones.map((row, r) =>
            row.map((cell, c) => {
              const placeable = !disabled && (canPlace?.(r, c) ?? false);
              const isHovered = hovered?.[0] === r && hovered?.[1] === c;
              const isArmed = armed?.[0] === r && armed?.[1] === c;
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are stable positional keys
                  key={`${r}-${c}`}
                  className="flex items-center justify-center bg-transparent border-none p-0 relative"
                  style={{ cursor: placeable ? 'pointer' : 'default' }}
                  disabled={!placeable}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={() => placeable && setHovered([r, c])}
                  onMouseLeave={() => setHovered(null)}
                  data-row={r}
                  data-col={c}
                  aria-label={`${r + 1},${c + 1}${cell ? ` (${cell})` : ''}`}
                >
                  <AnimatePresence>
                    {cell && <StoneView key={`s-${r}-${c}`} stone={cell} />}
                    {!cell && !disabled && isTouch && isArmed && previewStone && (
                      <motion.div
                        key="armed-preview"
                        data-testid="armed-preview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        exit={{ opacity: 0 }}
                        className={`w-[77%] aspect-square rounded-full ${
                          previewStone === 'black' ? 'bg-[#1a1108]' : 'bg-white'
                        }`}
                      />
                    )}
                    {!cell && !disabled && !isTouch && isHovered && previewStone && (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        className={`w-[77%] aspect-square rounded-full ${
                          previewStone === 'black' ? 'bg-[#1a1108]' : 'bg-white'
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

        {/* Mobile tap-to-confirm chip */}
        {armed && isTouch && (
          <ConfirmChip
            row={armed[0]}
            col={armed[1]}
            size={size}
            onConfirm={() => {
              const [r, c] = armed;
              clearArmed();
              onPlace?.(r, c);
            }}
            onCancel={clearArmed}
          />
        )}
      </div>
    </div>
  );
}
