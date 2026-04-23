import { ArrowRight } from 'lucide-react';

interface SectionHeadProps {
  title: string;
  /** Anchor href for the View all link. Ignored when onViewAll is provided. */
  viewAllHref?: string;
  /** Click handler for View all. Takes precedence over viewAllHref. */
  onViewAll?: () => void;
  /** Label for the View all link. Defaults to "View all". */
  viewAllLabel?: string;
}

/**
 * Section header: h3 title on the left, optional "View all" link on the right.
 */
export function SectionHead({
  title,
  viewAllHref,
  onViewAll,
  viewAllLabel = 'View all',
}: SectionHeadProps) {
  const showLink = Boolean(onViewAll || viewAllHref);
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {showLink &&
        (onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {viewAllLabel}
            <ArrowRight className="size-3.5" />
          </button>
        ) : (
          <a
            href={viewAllHref}
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {viewAllLabel}
            <ArrowRight className="size-3.5" />
          </a>
        ))}
    </div>
  );
}
