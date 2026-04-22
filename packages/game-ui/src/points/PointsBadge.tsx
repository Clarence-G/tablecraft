interface PointsBadgeProps {
  points: number;
  /** Optional label prefix, e.g. "Points". If omitted the number stands alone. */
  label?: string;
}

/**
 * Small pill showing a points count. Used inside Stat or alongside names.
 */
export function PointsBadge({ points, label }: PointsBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border-2 border-border bg-secondary rounded-full px-2 py-0.5">
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="text-foreground">{points}</span>
    </span>
  );
}
