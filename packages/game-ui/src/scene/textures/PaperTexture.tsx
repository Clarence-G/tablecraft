import { useId } from 'react';
import type { TextureProps } from './TextureLayer';

/**
 * Parse a hex / rgb color and return a rough perceived luminance in [0, 1].
 * Dark backgrounds (< 0.5) invert the paper ornaments so they stay legible;
 * light backgrounds keep the classic brown foxing look.
 */
function perceivedLuminance(input?: string): number {
  if (!input) return 1;
  const s = input.trim().toLowerCase();

  let r = 255;
  let g = 255;
  let b = 255;
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) {
      r = Number.parseInt(h[0] + h[0], 16);
      g = Number.parseInt(h[1] + h[1], 16);
      b = Number.parseInt(h[2] + h[2], 16);
    } else if (h.length === 6) {
      r = Number.parseInt(h.slice(0, 2), 16);
      g = Number.parseInt(h.slice(2, 4), 16);
      b = Number.parseInt(h.slice(4, 6), 16);
    }
  } else {
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) {
      r = Number.parseInt(m[1], 10);
      g = Number.parseInt(m[2], 10);
      b = Number.parseInt(m[3], 10);
    }
  }

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Paper texture -- machine-made stock with directional grain and organic
 * aging. The signature read is a SUBTLE HORIZONTAL FIBER (the direction
 * pulp flows through the machine) plus irregular FOXING POOLS (age
 * spots from oxidation), with a warm edge vignette for "foxed edges".
 *
 * Design rules learned from leather/velvet iterations:
 *   - Anisotropic turbulence (baseFrequency X Y -- X low, Y high) gives
 *     the horizontal grain that says "paper" not "canvas".
 *   - Foxing is ORGANIC: low-frequency turbulence tinted with brown,
 *     not hand-drawn circles (those read as "ink drops").
 *   - Layers should all be turbulence + gradients, no hand-drawn paths.
 *
 * Light/dark branch: on light paper (cream, manila) we warm the noise
 * with umber/sepia; on dark paper (midnight, ink) we lift the noise
 * with cream to keep the fiber visible.
 */
export function PaperTexture({ color, accent: _accent }: TextureProps) {
  const id = useId();
  const fiberId = `${id}-fiber`;
  const dustId = `${id}-dust`;
  const foxingId = `${id}-foxing`;
  const vigId = `${id}-vig`;

  const lum = perceivedLuminance(color);
  const isLight = lum >= 0.5;

  // Horizontal fiber tint. Umber on light paper, cream on dark paper.
  const fiberTint = isLight
    ? { r: 0.22, g: 0.16, b: 0.08, a: 0.18 }
    : { r: 0.95, g: 0.88, b: 0.72, a: 0.12 };

  // High-frequency dust noise (paper "grain") -- same tint, lower alpha.
  const dustTint = isLight
    ? { r: 0.18, g: 0.12, b: 0.05, a: 0.1 }
    : { r: 0.98, g: 0.92, b: 0.78, a: 0.07 };

  // Foxing pool color -- organic age spots. Deep sepia on light paper,
  // soft gold-cream on dark paper so it reads as "glow" not "stain".
  const foxingTint = isLight
    ? { r: 0.55, g: 0.32, b: 0.1, a: 0.24 }
    : { r: 0.88, g: 0.74, b: 0.5, a: 0.16 };

  // Edge vignette: warm foxed border on light paper, soft darkness on dark paper.
  const vignetteStops = isLight
    ? {
        innerColor: 'rgba(122,80,6,0)',
        midColor: 'rgba(122,80,6,0.08)',
        outerColor: 'rgba(122,80,6,0.26)',
      }
    : {
        innerColor: 'rgba(0,0,0,0)',
        midColor: 'rgba(0,0,0,0.10)',
        outerColor: 'rgba(0,0,0,0.32)',
      };

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
        {/* Layer 1: horizontal fiber grain -- the paper-machine signature.
            baseFrequency 0.008 X / 0.04 Y pulls the noise into horizontal
            streaks (the direction pulp flowed during manufacture). */}
        <filter id={fiberId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.04"
            numOctaves="2"
            seed="4"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values={`0 0 0 0 ${fiberTint.r}
                    0 0 0 0 ${fiberTint.g}
                    0 0 0 0 ${fiberTint.b}
                    0 0 0 ${fiberTint.a} 0`}
          />
        </filter>

        {/* Layer 2: high-frequency dust -- the micro-grain you see when
            light rakes across paper. Isotropic, very fine. */}
        <filter id={dustId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="1"
            seed="17"
            result="dust"
          />
          <feColorMatrix
            in="dust"
            type="matrix"
            values={`0 0 0 0 ${dustTint.r}
                    0 0 0 0 ${dustTint.g}
                    0 0 0 0 ${dustTint.b}
                    0 0 0 ${dustTint.a} 0`}
          />
        </filter>

        {/* Layer 3: foxing pools -- organic age spots. Ultra-low-frequency
            turbulence (0.004 X / 0.006 Y) creates big irregular
            blotches instead of uniform noise, much closer to real
            oxidation pools than hand-drawn circles. */}
        <filter id={foxingId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.004 0.006"
            numOctaves="3"
            seed="29"
            result="pools"
          />
          {/* Squeeze midtones out so only the highlights/lowlights of
              the noise become visible -- the result reads as discrete
              age spots rather than continuous haze. */}
          <feComponentTransfer in="pools" result="shaped">
            <feFuncA type="table" tableValues="0 0 0 0.4 1 0.4 0 0 0" />
          </feComponentTransfer>
          <feColorMatrix
            in="shaped"
            type="matrix"
            values={`0 0 0 0 ${foxingTint.r}
                    0 0 0 0 ${foxingTint.g}
                    0 0 0 0 ${foxingTint.b}
                    0 0 0 ${foxingTint.a} 0`}
          />
        </filter>

        <radialGradient id={vigId} cx="50%" cy="50%" r="78%">
          <stop offset="50%" stopColor={vignetteStops.innerColor} />
          <stop offset="82%" stopColor={vignetteStops.midColor} />
          <stop offset="100%" stopColor={vignetteStops.outerColor} />
        </radialGradient>
      </defs>

      <rect width="1000" height="1000" filter={`url(#${fiberId})`} />
      <rect width="1000" height="1000" filter={`url(#${dustId})`} />
      <rect width="1000" height="1000" filter={`url(#${foxingId})`} />
      <rect width="1000" height="1000" fill={`url(#${vigId})`} />
    </svg>
  );
}
