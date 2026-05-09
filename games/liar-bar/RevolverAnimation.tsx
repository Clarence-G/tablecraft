import { useEffect, useState } from 'react';
import { type AnimationTiming, getAnimationTiming, prefersReducedMotion } from './revolverTiming';

export type RevolverPhase = 'spin' | 'flash' | 'done';

export interface RevolverAnimationProps {
  outcome: 'hit' | 'blank';
  variant?: 'full' | 'condensed';
  resultLabel: string;
  // Identity token: when this changes, the animation restarts.
  // Pass something like `${shooterId}-${chamberIndex}`.
  triggerKey: string;
  onComplete?: () => void;
}

export function RevolverAnimation({
  outcome,
  variant = 'full',
  resultLabel,
  triggerKey,
  onComplete,
}: RevolverAnimationProps) {
  const reduce = prefersReducedMotion();
  const condensed = variant === 'condensed';
  const timing: AnimationTiming = getAnimationTiming(reduce, condensed);
  const [phase, setPhase] = useState<RevolverPhase>(reduce ? 'flash' : 'spin');

  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerKey resets the animation
  useEffect(() => {
    setPhase(reduce ? 'flash' : 'spin');
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!reduce) {
      timers.push(setTimeout(() => setPhase('flash'), timing.spinMs));
    }
    timers.push(
      setTimeout(() => {
        setPhase('done');
        onComplete?.();
      }, timing.spinMs + timing.flashMs),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [triggerKey, reduce, timing.spinMs, timing.flashMs]);

  const size = condensed ? 56 : 96;
  const isHit = outcome === 'hit';
  const flashColor = isHit ? 'hsl(var(--destructive))' : 'hsl(var(--success))';

  const center = size / 2;
  const cylinderRadius = size * 0.42;
  const chamberRadius = size * 0.28;
  const chamberDotR = size * 0.085;
  const chambers = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: center + Math.cos(angle) * chamberRadius,
      cy: center + Math.sin(angle) * chamberRadius,
    };
  });

  return (
    <div
      className="inline-flex flex-col items-center gap-1"
      role="img"
      aria-label={resultLabel}
      data-testid="revolver-animation"
      data-phase={phase}
      data-variant={variant}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          style={{
            transformOrigin: 'center',
            transition: reduce
              ? 'none'
              : `transform ${timing.spinMs}ms cubic-bezier(0.2,0.8,0.2,1)`,
            transform: phase === 'spin' ? 'rotate(0deg)' : 'rotate(720deg)',
          }}
        >
          <title>{resultLabel}</title>
          <circle
            cx={center}
            cy={center}
            r={cylinderRadius}
            fill="hsl(var(--card))"
            stroke="hsl(var(--foreground))"
            strokeWidth={2.5}
          />
          {chambers.map((c, i) => (
            <circle
              key={`chamber-${i}-${c.cx.toFixed(2)}-${c.cy.toFixed(2)}`}
              cx={c.cx}
              cy={c.cy}
              r={chamberDotR}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
          ))}
          <circle cx={center} cy={center} r={size * 0.06} fill="hsl(var(--foreground))" />
        </svg>
        {phase !== 'spin' && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${flashColor} 0%, transparent 70%)`,
              opacity: phase === 'flash' ? 0.85 : 0,
              transition: `opacity ${timing.flashMs}ms ease-out`,
            }}
          />
        )}
      </div>
      <div
        className={`text-xs font-bold ${isHit ? 'text-destructive' : 'text-success'}`}
        style={{ opacity: phase === 'done' ? 1 : 0, transition: 'opacity 150ms ease-out' }}
      >
        {resultLabel}
      </div>
    </div>
  );
}
