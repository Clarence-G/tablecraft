interface GridBoardProps {
  rows: number;
  cols: number;
  renderCell: (row: number, col: number) => React.ReactNode;
  cellSize?: number;
  className?: string;
}

export function GridBoard({
  rows,
  cols,
  renderCell,
  cellSize = 40,
  className = '',
}: GridBoardProps) {
  return (
    <div
      className={`inline-grid border border-border ${className}`}
      style={{
        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
      }}
    >
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are fixed positional keys
            key={`${r}-${c}`}
            className="border border-border/30 flex items-center justify-center"
          >
            {renderCell(r, c)}
          </div>
        )),
      )}
    </div>
  );
}
