import { useId } from 'react';
import type { TextureProps } from './TextureLayer';

/**
 * Casino baize felt — the green cloth of high-end poker and bridge
 * tables. Built to read as *fabric*, not as a grid. Every layer is
 * organic noise; there is no mechanical pattern anywhere.
 *
 * Layered construction (bottom -> top):
 *   1. Fine fiber grain  -- very high frequency turbulence. Zero
 *                           directional stretch. This is the "tooth" of
 *                           the cloth you only notice up close, the
 *                           difference between felt and painted plastic.
 *   2. Directional nap   -- medium-frequency stretched turbulence, lying
 *                           along one axis. This is the brushed direction
 *                           of the pile and carries most of the "cloth"
 *                           read.
 *   3. Nap sheen band    -- one broad diagonal highlight, offset from
 *                           center so it reads independently of any
 *                           radial ambience applied above the texture.
 *   4. Corner shadow     -- strong radial darkening at the four corners,
 *                           the way a tailored cloth drops shadow where
 *                           it curves over the rail.
 */
export function FeltTexture({ color: _color, accent: _accent }: TextureProps) {
  const id = useId();
  const grainId = `${id}-grain`;
  const napId = `${id}-nap`;
  const sheenId = `${id}-sheen`;
  const cornerId = `${id}-corner`;

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
        {/* Layer 1: fine fiber grain -- the "tooth" of the cloth. Very
            high frequency so it reads as a uniform soft grain rather than
            as any pattern. No axial stretch, so it never looks like a
            weave. */}
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.8"
            numOctaves="2"
            seed="17"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0.26 0"
          />
        </filter>

        {/* Layer 2: directional fiber nap. Stretched turbulence so fibers
            run in one direction instead of looking like random static. */}
        <filter id={napId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.12 0.9"
            numOctaves="2"
            seed="6"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0.30 0"
          />
        </filter>

        {/* Layer 3: nap sheen band. Broad asymmetric diagonal highlight. */}
        <linearGradient id={sheenId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="25%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="75%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </linearGradient>

        {/* Layer 4: strong corner shadow -- the key "tailored table cloth"
            cue. Radial gradient with a hard-ish falloff. */}
        <radialGradient id={cornerId} cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="62%" stopColor="rgba(0,0,0,0)" />
          <stop offset="85%" stopColor="rgba(0,0,0,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.38)" />
        </radialGradient>
      </defs>

      {/* 1. fiber grain -- the soft tooth underneath everything. */}
      <rect width="1000" height="1000" filter={`url(#${grainId})`} />

      {/* 2. directional nap -- the bulk of the "felt" read. */}
      <rect width="1000" height="1000" filter={`url(#${napId})`} />

      {/* 3. sheen band along the nap angle. */}
      <rect width="1000" height="1000" fill={`url(#${sheenId})`} />

      {/* 4. corner shadow -- makes the table feel "framed". */}
      <rect width="1000" height="1000" fill={`url(#${cornerId})`} />
    </svg>
  );
}
