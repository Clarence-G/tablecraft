import type { ReactNode } from 'react';

interface ViewAllRowProps {
  children: ReactNode;
  /** Extra classes merged onto the scroll container. */
  className?: string;
}

/**
 * Horizontally scrollable row with snap points. Used for the Active rooms
 * carousel on the lobby. On touch it scrolls; on desktop it simply lays out
 * flex children and clips overflow.
 */
export function ViewAllRow({ children, className = '' }: ViewAllRowProps) {
  return (
    <div
      className={`flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 ${className}`}
    >
      {children}
    </div>
  );
}
