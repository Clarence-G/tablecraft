import type { ReactNode } from 'react';

interface StatProps {
  label: string;
  value: ReactNode;
  /** Use larger typography for prominent stats (e.g. Points in Hero). */
  big?: boolean;
}

/**
 * Label + value pair, presented in a skeuomorphic card-style block.
 * Used in the logged-in Hero to show Points and Rank.
 */
export function Stat({ label, value, big = false }: StatProps) {
  return (
    <div className="inline-flex flex-col items-start gap-0.5 bg-card border-2 border-border rounded-[12px] px-3 py-2 shadow-card">
      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </span>
      <span
        className={
          big ? 'text-2xl font-bold text-foreground' : 'text-base font-semibold text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}
