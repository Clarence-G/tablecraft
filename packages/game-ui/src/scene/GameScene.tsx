import type { GameScene as GameSceneConfig } from '@repo/shared';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { TextureLayer } from './textures';

export type { GameSceneConfig };

export interface GameSceneProps {
  scene?: GameSceneConfig;
  className?: string;
  children: ReactNode;
}

const WARMTH_COLOR = {
  warm: '255, 223, 168',
  cool: '180, 210, 255',
  neutral: '255, 255, 255',
} as const;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

/**
 * Wraps a game's Play Surface (Zone C content) with per-game scene theming.
 * Backward compatible: if `scene` is undefined, passes children through
 * unchanged — the platform cream surface remains visible.
 *
 * DOM stack, bottom to top:
 *   1. base color fill (wrapper backgroundColor)
 *   2. texture layer (inline SVG inside TextureLayer)
 *   3. ambience layer (pure lighting gradient)
 *   4. content (children, raised via z-index)
 */
export function GameScene({ scene, className, children }: GameSceneProps) {
  const isMobile = useIsMobile();
  if (!scene) return <>{children}</>;

  const surface = scene.surface ?? {};
  const ambience = scene.ambience ?? {};
  const texture = surface.texture ?? null;
  const warmth = WARMTH_COLOR[ambience.warmth ?? 'neutral'];
  const baseIntensity = ambience.intensity ?? 0.35;
  const intensity = isMobile ? Math.max(0, baseIntensity * 0.7) : baseIntensity;

  const style: CSSProperties = {
    ['--scene-surface' as string]: surface.color ?? 'transparent',
    ['--scene-accent' as string]: surface.accent ?? 'transparent',
    backgroundColor: surface.color ?? undefined,
    padding: isMobile ? '12px' : '24px',
  };

  let ambienceBackground: string | undefined;
  if (ambience.type === 'spotlight') {
    ambienceBackground = `radial-gradient(ellipse at 50% 38%, rgba(${warmth}, ${intensity}) 0%, rgba(${warmth}, 0) 58%)`;
  } else if (ambience.type === 'ambient') {
    ambienceBackground = `radial-gradient(circle at 50% 30%, rgba(${warmth}, ${intensity * 0.6}), transparent 70%)`;
  }

  return (
    <div
      data-testid="game-scene"
      data-scene-texture={texture ?? 'none'}
      data-scene-ambience={ambience.type ?? 'none'}
      className={`relative flex-1 min-h-0 flex flex-col items-stretch overflow-hidden ${className ?? ''}`}
      style={style}
    >
      <TextureLayer kind={texture} color={surface.color ?? 'transparent'} accent={surface.accent} />
      {ambienceBackground && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: ambienceBackground }}
        />
      )}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-stretch">{children}</div>
    </div>
  );
}
