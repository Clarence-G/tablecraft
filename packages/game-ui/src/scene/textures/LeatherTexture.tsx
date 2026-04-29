import { useId } from 'react';
import type { TextureProps } from './TextureLayer';

/**
 * Oiled saddle leather -- the worn, warm hide of a card-room cover or
 * saloon counter. Reads as a *hide* with a pored surface and a patina
 * that has soaked into the grain, not as a flat warm gradient.
 *
 * Layered construction (bottom -> top):
 *   1. Pore grain       -- high-frequency turbulence with visible cells,
 *                          the polygonal "skin" of leather.
 *   2. Patina mottling  -- slow tonal variation, the way oiled leather
 *                          darkens in recesses and lightens on raised
 *                          grain. Kills the "flat brown fill".
 *   3. Directional sheen-- a single anisotropic band at ~15deg off
 *                          horizontal. Leather catches light *along* its
 *                          grain, not in circles.
 *   4. Edge darkening   -- heavy vignette with warm undertone, the
 *                          burnished border around a piece of hide.
 *
 * Wear lives in the patina layer, not as drawn creases. Drawn creases
 * read as "scratches" against the rest of the procedural noise and
 * pulled the overall look down, so they were removed.
 */
export function LeatherTexture({ color: _color, accent: _accent }: TextureProps) {
  const id = useId();
  const poreId = `${id}-pore`;
  const patinaId = `${id}-patina`;
  const sheenId = `${id}-sheen`;
  const edgeId = `${id}-edge`;

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
        {/* Layer 1: pore grain -- high frequency with slight anisotropy
            so cells aren't perfectly square. */}
        <filter id={poreId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9 1.1"
            numOctaves="2"
            seed="13"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.02
                    0 0 0 0 0.01
                    0 0 0 0 0
                    0 0 0 0.62 0"
          />
        </filter>

        {/* Layer 2: patina mottling -- large-scale tonal unevenness with
            more octaves than before, so the surface has irregular wear
            spots (darker elbow pools, lighter raised fields) instead of
            uniform patina. This replaces the drawn creases: wear is felt
            across the whole hide, not in three lines. */}
        <filter id={patinaId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.014"
            numOctaves="3"
            seed="23"
            result="slow"
          />
          <feColorMatrix
            in="slow"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0.36 0"
          />
        </filter>

        {/* Layer 3: directional sheen -- a single anisotropic band. */}
        <linearGradient id={sheenId} x1="0%" y1="35%" x2="100%" y2="65%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.10)" />
          <stop offset="30%" stopColor="rgba(255,230,190,0.04)" />
          <stop offset="48%" stopColor="rgba(255,230,190,0.22)" />
          <stop offset="55%" stopColor="rgba(255,230,190,0.22)" />
          <stop offset="72%" stopColor="rgba(255,230,190,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </linearGradient>

        {/* Layer 4: edge darkening -- strong tailored-border vignette. */}
        <radialGradient id={edgeId} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="85%" stopColor="rgba(15,5,0,0.30)" />
          <stop offset="100%" stopColor="rgba(10,3,0,0.55)" />
        </radialGradient>
      </defs>

      <rect width="1000" height="1000" filter={`url(#${poreId})`} />
      <rect width="1000" height="1000" filter={`url(#${patinaId})`} />
      <rect width="1000" height="1000" fill={`url(#${sheenId})`} />
      <rect width="1000" height="1000" fill={`url(#${edgeId})`} />
    </svg>
  );
}
