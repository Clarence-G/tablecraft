import type { CSSProperties, ReactNode } from 'react';
import type { CardSize } from './index.js';
import './styles.css';

export interface CardBackProps {
  size?: CardSize;
}

const SIZE_DIMS: Record<CardSize, { width: number; height: number }> = {
  sm: { width: 48, height: 68 },
  md: { width: 72, height: 100 },
  lg: { width: 108, height: 152 },
};

function DiamondGrid(): ReactNode {
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
          id="card-ui-back-grid"
          x="0"
          y="0"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="#fcf8f0" fillOpacity="0.22" />
          <path
            d="M4 0 L8 4 L4 8 L0 4 Z"
            fill="none"
            stroke="#fcf8f0"
            strokeOpacity="0.35"
            strokeWidth="0.4"
          />
        </pattern>
      </defs>
      <rect width="40" height="56" fill="url(#card-ui-back-grid)" />
      <rect
        x="2"
        y="2"
        width="36"
        height="52"
        fill="none"
        stroke="#fcf8f0"
        strokeOpacity="0.55"
        strokeWidth="0.8"
        rx="3"
        ry="3"
      />
    </svg>
  );
}

export function CardBack({ size = 'md' }: CardBackProps) {
  const dims = SIZE_DIMS[size];
  const style: CSSProperties = { width: dims.width, height: dims.height };
  return (
    <div
      className="card-ui-card card-ui-face-down"
      style={style}
      data-testid="card-back"
      data-face-down="true"
      aria-label="card back"
    >
      <DiamondGrid />
    </div>
  );
}
