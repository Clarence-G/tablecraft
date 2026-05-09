// Pure timing math for the Liar Bar revolver animation.
// Extracted from RevolverAnimation.tsx so it can be unit-tested under
// the node-env vitest config (no React/JSX in this file).

export const SPIN_MS_FULL = 600;
export const SPIN_MS_CONDENSED = 350;
export const FLASH_MS = 220;

export interface AnimationTiming {
  spinMs: number;
  flashMs: number;
  totalMs: number;
}

export function getAnimationTiming(reduce: boolean, condensed: boolean): AnimationTiming {
  if (reduce) {
    return { spinMs: 0, flashMs: FLASH_MS, totalMs: FLASH_MS };
  }
  const spinMs = condensed ? SPIN_MS_CONDENSED : SPIN_MS_FULL;
  return { spinMs, flashMs: FLASH_MS, totalMs: spinMs + FLASH_MS };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
