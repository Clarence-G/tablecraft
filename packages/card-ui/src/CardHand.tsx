import { type CSSProperties, Children, type ReactNode } from 'react';
import type { CardSize } from './index.js';
import './styles.css';

export interface CardHandProps {
  children: ReactNode;
  size?: CardSize;
}

interface Slot {
  rotateDeg: number;
  translateX: number;
  translateY: number;
}

const SIZE_CARD_WIDTH: Record<CardSize, number> = { sm: 48, md: 72, lg: 108 };
const SIZE_CARD_HEIGHT: Record<CardSize, number> = { sm: 68, md: 100, lg: 152 };
const SIZE_SPREAD_X: Record<CardSize, number> = { sm: 22, md: 34, lg: 48 };
const SIZE_ROTATION_STEP: Record<CardSize, number> = { sm: 5, md: 6, lg: 7 };
const SIZE_ARC_STEP: Record<CardSize, number> = { sm: 2, md: 3, lg: 4 };

export function computeFanSlot(index: number, count: number, size: CardSize = 'md'): Slot {
  if (count <= 1) return { rotateDeg: 0, translateX: 0, translateY: 0 };
  const center = (count - 1) / 2;
  const offset = index - center;
  return {
    rotateDeg: offset * SIZE_ROTATION_STEP[size],
    translateX: offset * SIZE_SPREAD_X[size],
    translateY: Math.abs(offset) * SIZE_ARC_STEP[size],
  };
}

export function computeHandDimensions(
  count: number,
  size: CardSize = 'md',
): { width: number; height: number } {
  const cardWidth = SIZE_CARD_WIDTH[size];
  const cardHeight = SIZE_CARD_HEIGHT[size];
  if (count <= 0) return { width: cardWidth, height: cardHeight };
  if (count === 1) return { width: cardWidth, height: cardHeight + 18 };
  const center = (count - 1) / 2;
  const spreadX = center * SIZE_SPREAD_X[size];
  const arcY = center * SIZE_ARC_STEP[size];
  return {
    width: Math.round(cardWidth + 2 * spreadX),
    height: Math.round(cardHeight + arcY + 18),
  };
}

export function CardHand({ children, size = 'md' }: CardHandProps) {
  const childArray = Children.toArray(children);
  const count = childArray.length;
  const dims = computeHandDimensions(count, size);

  const containerStyle: CSSProperties = {
    width: dims.width,
    height: dims.height,
  };

  return (
    <div className="card-ui-hand" style={containerStyle} data-testid="card-hand" data-count={count}>
      {childArray.map((child, i) => {
        const slot = computeFanSlot(i, count, size);
        const slotStyle: CSSProperties = {
          transform: `translate(-50%, 0) translate(${slot.translateX}px, ${slot.translateY}px) rotate(${slot.rotateDeg}deg)`,
        };
        return (
          <div key={i} className="card-ui-hand-slot" data-slot-index={i} style={slotStyle}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
