import { useId } from 'react';
import type { TextureProps } from './TextureLayer';

export function WoodTexture({ color: _color, accent }: TextureProps) {
  const id = useId();
  const grainId = `${id}-grain`;
  const knotId = `${id}-knot`;
  const lightId = `${id}-light`;
  const darkStroke = accent ?? '#3a2418';
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1000 1000"
    >
      <defs>
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.15"
            numOctaves="3"
            seed="7"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.18
                    0 0 0 0 0.08
                    0 0 0 0 0.03
                    0 0 0 0.35 0"
          />
        </filter>
        <radialGradient id={knotId}>
          <stop offset="0%" stopColor="rgba(18,10,4,0.8)" />
          <stop offset="45%" stopColor="rgba(30,16,8,0.35)" />
          <stop offset="100%" stopColor="rgba(30,16,8,0)" />
        </radialGradient>
        <linearGradient id={lightId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,222,180,0.14)" />
          <stop offset="50%" stopColor="rgba(255,222,180,0)" />
          <stop offset="100%" stopColor="rgba(20,10,5,0.10)" />
        </linearGradient>
      </defs>

      <rect width="1000" height="1000" filter={`url(#${grainId})`} />

      <g
        stroke={darkStroke}
        fill="none"
        strokeOpacity="0.10"
        strokeWidth="1.5"
        transform="translate(1240 -180)"
      >
        <ellipse rx="240" ry="820" />
        <ellipse rx="330" ry="960" />
        <ellipse rx="430" ry="1120" />
        <ellipse rx="540" ry="1300" />
        <ellipse rx="680" ry="1520" />
      </g>

      <circle cx="190" cy="760" r="36" fill={`url(#${knotId})`} />
      <circle cx="820" cy="290" r="22" fill={`url(#${knotId})`} />
      <circle cx="520" cy="180" r="14" fill={`url(#${knotId})`} />

      <rect width="1000" height="1000" fill={`url(#${lightId})`} />
    </svg>
  );
}
