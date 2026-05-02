import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ViewAllRowProps {
  children: ReactNode;
  /** Extra classes merged onto the scroll container. */
  className?: string;
}

/**
 * Horizontally scrollable row with snap points.
 *
 * Desktop UX:
 * - Native scrollbar is hidden (visually noisy).
 * - Mouse wheel (deltaY) is mapped to horizontal scroll so trackpad-less users
 *   can still scroll without a visible scrollbar.
 * - Chevron buttons fade in on hover when content overflows.
 * - Soft edge-fade gradients hint "more over here" at the clipped side.
 *
 * Mobile UX:
 * - Works as a normal swipe carousel. Chevrons are hidden (no hover).
 */
export function ViewAllRow({ children, className = '' }: ViewAllRowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Update edge state (disables chevrons / fade when at either end).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanLeft(scrollLeft > 2);
      setCanRight(scrollLeft + clientWidth < scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Also re-check when children change size (e.g. lazy-loaded images)
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  // Map vertical wheel to horizontal scroll (desktop mouse users have no
  // native way to scroll a horizontal container without Shift).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only intercept when user is actually scrolling vertically — let
      // trackpad horizontal gestures pass through unchanged.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Only intercept when there's somewhere to scroll horizontally.
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="group/row relative">
      <div
        ref={scrollRef}
        className={`flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none ${className}`}
      >
        {children}
      </div>

      {/* Left edge fade + chevron */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 hidden sm:block ${
          canLeft ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-320)}
        tabIndex={-1}
        className={`hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 size-8 items-center justify-center rounded-full border-2 border-foreground bg-card shadow-button transition-all duration-200 hover:-translate-y-[calc(50%+2px)] hover:shadow-button-hover active:translate-y-[calc(-50%+1px)] active:shadow-button-active ${
          canLeft
            ? 'opacity-0 group-hover/row:opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronLeft className="size-4" />
      </button>

      {/* Right edge fade + chevron */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 hidden sm:block ${
          canRight ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(320)}
        tabIndex={-1}
        className={`hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 size-8 items-center justify-center rounded-full border-2 border-foreground bg-card shadow-button transition-all duration-200 hover:-translate-y-[calc(50%+2px)] hover:shadow-button-hover active:translate-y-[calc(-50%+1px)] active:shadow-button-active ${
          canRight
            ? 'opacity-0 group-hover/row:opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
