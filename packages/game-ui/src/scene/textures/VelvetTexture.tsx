import { useId } from 'react';
import type { TextureProps } from './TextureLayer';

/**
 * Crushed velvet -- aristocratic pile. The luxury reads through
 * QUIET DRAMA, not loud texture. Velvet's defining trait is that the
 * pile absorbs light deeply (near-black plum in shadow) while the
 * highlights shift hue subtly (warm gold + a breath of pink).
 *
 * Design rule learned from v2: noise layers KILL velvet. Unlike felt
 * (show fibers) or leather (show pores), velvet should read as
 * "smooth fog with theatrical lighting" -- the pile itself is all
 * but invisible.
 *
 * Layered construction (bottom -> top):
 *   1. Whisper mottling -- ultra-low-frequency tonal waves, almost
 *                          imperceptible. Just enough to break the
 *                          flat-paint read. Opacity 0.10 (not 0.20).
 *   2. Deep shadow pool -- near-black plum in the lower-right. This
 *                          is where velvet earns its keep: the
 *                          shadow is FAR darker than the base color
 *                          would suggest.
 *   3. Warm sheen       -- accent-tinted bloom in the upper-left.
 *                          Single soft zone, not aggressive.
 *   4. Pink-kiss bloom  -- offset cool highlight that shifts hue
 *                          (not just brightness) in the warm region.
 *   5. Edge darkening   -- tailored-cushion vignette.
 */
export function VelvetTexture({ color: _color, accent }: TextureProps) {
  const id = useId();
  const mottleId = `${id}-mottle`;
  const shadowId = `${id}-shadow`;
  const warmId = `${id}-warm`;
  const bloomId = `${id}-bloom`;
  const edgeId = `${id}-edge`;

  // Warm sheen adopts the game's accent (gold for Love Letter, etc.).
  // Falls back to a rich cream-gold if nothing was configured.
  const warmColor = accent ?? '#e8c88a';

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
        {/* Layer 1: whisper mottling -- barely there. Opacity dropped
            from 0.20 to 0.10: velvet should not show visible noise. */}
        <filter id={mottleId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.008"
            numOctaves="2"
            seed="31"
            result="slow"
          />
          <feColorMatrix
            in="slow"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0.10 0"
          />
        </filter>

        {/* Layer 2: deep shadow pool -- near-black plum. Kept the v2
            darkening because it's what gives velvet its gravity. */}
        <radialGradient id={shadowId} cx="78%" cy="82%" r="62%">
          <stop offset="0%" stopColor="rgba(8,2,14,0.62)" />
          <stop offset="45%" stopColor="rgba(8,2,14,0.30)" />
          <stop offset="100%" stopColor="rgba(8,2,14,0)" />
        </radialGradient>

        {/* Layer 3: warm sheen -- single broad soft zone. Opacity 0.30
            sits between v1's 0.28 and v2's aggressive 0.38. */}
        <radialGradient id={warmId} cx="28%" cy="22%" r="55%">
          <stop offset="0%" stopColor={warmColor} stopOpacity="0.30" />
          <stop offset="55%" stopColor={warmColor} stopOpacity="0.10" />
          <stop offset="100%" stopColor={warmColor} stopOpacity="0" />
        </radialGradient>

        {/* Layer 4: pink-kiss bloom -- the luxury cue. Hue shift in
            highlights is what separates velvet from matte cloth. */}
        <radialGradient id={bloomId} cx="52%" cy="34%" r="34%">
          <stop offset="0%" stopColor="rgba(255,180,220,0.16)" />
          <stop offset="60%" stopColor="rgba(255,180,220,0.04)" />
          <stop offset="100%" stopColor="rgba(255,180,220,0)" />
        </radialGradient>

        {/* Layer 5: edge darkening. */}
        <radialGradient id={edgeId} cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          <stop offset="88%" stopColor="rgba(5,2,8,0.26)" />
          <stop offset="100%" stopColor="rgba(5,2,8,0.48)" />
        </radialGradient>
      </defs>

      <rect width="1000" height="1000" filter={`url(#${mottleId})`} />
      <rect width="1000" height="1000" fill={`url(#${shadowId})`} />
      <rect width="1000" height="1000" fill={`url(#${warmId})`} />
      <rect width="1000" height="1000" fill={`url(#${bloomId})`} />
      <rect width="1000" height="1000" fill={`url(#${edgeId})`} />
    </svg>
  );
}
