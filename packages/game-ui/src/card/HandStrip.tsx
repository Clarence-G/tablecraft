import type { ReactNode } from 'react';

export interface HandStripCardState {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export interface HandStripProps<T> {
  cards: T[];
  renderCard: (card: T, state: HandStripCardState) => ReactNode;
  getKey: (card: T) => string;
  selectedKey?: string | null;
  onSelect?: (key: string, card: T) => void;
  isDisabled?: (card: T) => boolean;
  /** Pixels of negative margin applied between cards when hand is long. */
  maxOverlap?: number;
  /** Card count at which overlap kicks in. */
  overlapThreshold?: number;
  className?: string;
  emptyLabel?: ReactNode;
}

export function HandStrip<T>({
  cards,
  renderCard,
  getKey,
  selectedKey,
  onSelect,
  isDisabled,
  maxOverlap = 28,
  overlapThreshold = 9,
  className,
  emptyLabel,
}: HandStripProps<T>) {
  if (cards.length === 0) {
    return (
      <div
        data-testid="hand-strip"
        data-empty="true"
        className={`flex justify-center items-center min-h-[4rem] text-xs text-muted-foreground ${className ?? ''}`}
      >
        {emptyLabel ?? null}
      </div>
    );
  }

  const overlap = cards.length > overlapThreshold ? maxOverlap : 0;

  return (
    <div
      data-testid="hand-strip"
      className={`flex justify-center items-end gap-2 py-3 px-3 overflow-x-auto ${className ?? ''}`}
    >
      {cards.map((card, idx) => {
        const key = getKey(card);
        const selected = selectedKey === key;
        const disabled = isDisabled?.(card) ?? false;
        const state: HandStripCardState = {
          selected,
          disabled,
          onSelect: () => onSelect?.(key, card),
        };
        return (
          <div
            key={key}
            className={`shrink-0 ${selected ? 'relative z-10' : ''}`}
            style={
              idx > 0 && overlap > 0 ? { marginLeft: `calc(-${overlap}px - 0.5rem)` } : undefined
            }
          >
            {renderCard(card, state)}
          </div>
        );
      })}
    </div>
  );
}
