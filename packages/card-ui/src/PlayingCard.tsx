import type { CSSProperties, ReactNode } from 'react';
import type { CardRank, CardSize, CardSuit } from './index.js';
import './styles.css';

export interface PlayingCardProps {
  suit: CardSuit;
  rank: CardRank;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
}

interface Dimensions {
  width: number;
  height: number;
  cornerRankFont: number;
  cornerSuitSize: number;
  centerSuitSize: number;
}

const SIZE_DIMS: Record<CardSize, Dimensions> = {
  sm: { width: 48, height: 68, cornerRankFont: 10, cornerSuitSize: 8, centerSuitSize: 22 },
  md: { width: 72, height: 100, cornerRankFont: 14, cornerSuitSize: 12, centerSuitSize: 34 },
  lg: { width: 108, height: 152, cornerRankFont: 20, cornerSuitSize: 18, centerSuitSize: 52 },
};

const RED_SUITS: readonly CardSuit[] = ['hearts', 'diamonds'];

function SuitGlyph({ suit, size }: { suit: CardSuit; size: number }): ReactNode {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false as const,
  };

  switch (suit) {
    case 'hearts':
      return (
        <svg {...common}>
          <path
            d="M12 21s-7-4.35-9.5-9.1C.55 8 3 4 6.5 4 8.74 4 10.63 5.35 12 7c1.37-1.65 3.26-3 5.5-3 3.5 0 5.95 4 4 7.9C19 16.65 12 21 12 21z"
            fill="currentColor"
          />
        </svg>
      );
    case 'diamonds':
      return (
        <svg {...common}>
          <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="currentColor" />
        </svg>
      );
    case 'clubs':
      return (
        <svg {...common}>
          <path
            d="M12 2a4 4 0 0 0-3.3 6.26A4 4 0 1 0 8 16.33a4 4 0 0 0 3 1.67c0 1.5-.7 2.9-2 4h6c-1.3-1.1-2-2.5-2-4a4 4 0 0 0 3-1.67 4 4 0 1 0-.7-8.07A4 4 0 0 0 12 2z"
            fill="currentColor"
          />
        </svg>
      );
    case 'spades':
      return (
        <svg {...common}>
          <path
            d="M12 2C8 7 3 10.5 3 14.5A4.5 4.5 0 0 0 7.5 19c1.1 0 2.1-.4 3-1-.2 1.5-.9 2.8-2.1 4h7.2c-1.2-1.2-1.9-2.5-2.1-4 .9.6 1.9 1 3 1A4.5 4.5 0 0 0 21 14.5C21 10.5 16 7 12 2z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

function FaceDownPattern(): ReactNode {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 40 56"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable={false}
    >
      <defs>
        <pattern
          id="card-ui-back-diamond"
          x="0"
          y="0"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="#fcf8f0" fillOpacity="0.18" />
        </pattern>
      </defs>
      <rect width="40" height="56" fill="url(#card-ui-back-diamond)" />
    </svg>
  );
}

export function PlayingCard({
  suit,
  rank,
  size = 'md',
  faceDown = false,
  selected = false,
}: PlayingCardProps) {
  const dims = SIZE_DIMS[size];
  const colorClass = RED_SUITS.includes(suit) ? 'card-ui-red' : 'card-ui-black';
  const classes = [
    'card-ui-card',
    colorClass,
    faceDown ? 'card-ui-face-down' : '',
    selected ? 'card-ui-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style: CSSProperties = {
    width: dims.width,
    height: dims.height,
  };

  const ariaLabel = faceDown ? 'face-down card' : `${rank} of ${suit}`;

  if (faceDown) {
    return (
      <div
        className={classes}
        style={style}
        data-testid="playing-card"
        data-face-down="true"
        aria-label={ariaLabel}
      >
        <FaceDownPattern />
      </div>
    );
  }

  const cornerRankStyle: CSSProperties = { fontSize: dims.cornerRankFont };

  return (
    <div
      className={classes}
      style={style}
      data-testid="playing-card"
      data-suit={suit}
      data-rank={rank}
      aria-label={ariaLabel}
    >
      <div className="card-ui-corner card-ui-corner-tl">
        <span className="card-ui-text" style={cornerRankStyle}>
          {rank}
        </span>
        <SuitGlyph suit={suit} size={dims.cornerSuitSize} />
      </div>
      <div className="card-ui-center">
        <SuitGlyph suit={suit} size={dims.centerSuitSize} />
      </div>
      <div className="card-ui-corner card-ui-corner-br">
        <span className="card-ui-text" style={cornerRankStyle}>
          {rank}
        </span>
        <SuitGlyph suit={suit} size={dims.cornerSuitSize} />
      </div>
    </div>
  );
}
