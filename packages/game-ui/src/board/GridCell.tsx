import { motion } from 'framer-motion';

interface GridCellProps {
  row: number;
  col: number;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function GridCell({ row, col, children, onClick, className = '' }: GridCellProps) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center cursor-pointer bg-transparent border-none p-0 ${className}`}
      onClick={onClick}
      data-row={row}
      data-col={col}
    >
      {children}
    </button>
  );
}
