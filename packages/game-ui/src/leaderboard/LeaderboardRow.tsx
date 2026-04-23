import Avatar from 'boring-avatars';

interface LeaderboardRowProps {
  rank: number;
  userId: string;
  name: string;
  points: number;
  /** Render with emphasized border + filled background for "you" row. */
  highlighted?: boolean;
  /** Label prefix (e.g. "You") for the current-user pill inside a highlighted row. */
  youLabel?: string;
  /** Suffix after the point count, defaults to "pts". */
  pointsSuffix?: string;
}

/**
 * Single row of a leaderboard: rank · avatar · name · points.
 * Supports a highlighted variant used for the sticky "you" row.
 */
export function LeaderboardRow({
  rank,
  userId,
  name,
  points,
  highlighted,
  youLabel,
  pointsSuffix = 'pts',
}: LeaderboardRowProps) {
  const base =
    'flex items-center justify-between border-2 rounded-[10px] px-3 py-2 transition-colors';
  const tone = highlighted
    ? 'border-foreground bg-secondary shadow-[3px_3px_0_var(--foreground)]'
    : 'border-border bg-card';

  return (
    <div className={`${base} ${tone}`} data-testid={`leaderboard-row-${rank}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-bold text-sm w-8 tabular-nums text-muted-foreground">#{rank}</span>
        <Avatar size={24} name={userId} variant="beam" />
        <span className="font-semibold truncate">
          {name}
          {highlighted && youLabel && (
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              ({youLabel})
            </span>
          )}
        </span>
      </div>
      <span className="font-mono text-sm text-muted-foreground shrink-0">
        {points} {pointsSuffix}
      </span>
    </div>
  );
}
