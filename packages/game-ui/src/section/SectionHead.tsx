import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

interface SectionHeadProps {
  title: string;
  /** Anchor href for the View all link. Ignored when onViewAll is provided. */
  viewAllHref?: string;
  /** Click handler for View all. Takes precedence over viewAllHref. */
  onViewAll?: () => void;
  /** Label for the View all link. Defaults to "View all". */
  viewAllLabel?: string;
  /** Extra slot rendered on the right, before the View all link. */
  actions?: ReactNode;
}

/**
 * Section header: h3 title on the left, optional actions slot and "View all"
 * link on the right.
 */
export function SectionHead({
  title,
  viewAllHref,
  onViewAll,
  viewAllLabel = 'View all',
  actions,
}: SectionHeadProps) {
  const showLink = Boolean(onViewAll || viewAllHref);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
      <h3 className="text-lg font-semibold text-foreground shrink-0">{title}</h3>
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        {actions}
        {showLink &&
          (onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {viewAllLabel}
              <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <a
              href={viewAllHref}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {viewAllLabel}
              <ArrowRight className="size-3.5" />
            </a>
          ))}
      </div>
    </div>
  );
}
