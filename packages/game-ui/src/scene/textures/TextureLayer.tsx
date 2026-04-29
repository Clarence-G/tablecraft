import type { SceneTexture } from '@repo/shared';
import { FeltTexture } from './FeltTexture';
import { LeatherTexture } from './LeatherTexture';
import { PaperTexture } from './PaperTexture';
import { VelvetTexture } from './VelvetTexture';
import { WoodTexture } from './WoodTexture';

export interface TextureProps {
  /** Base color of the surface (used to tint the noise layer where relevant). */
  color: string;
  /** Accent color from scene.surface.accent; texture may use it for highlights. */
  accent?: string;
}

export interface TextureLayerProps extends TextureProps {
  kind: SceneTexture;
}

export function TextureLayer({ kind, color, accent }: TextureLayerProps) {
  switch (kind) {
    case 'wood':
      return <WoodTexture color={color} accent={accent} />;
    case 'felt':
      return <FeltTexture color={color} accent={accent} />;
    case 'velvet':
      return <VelvetTexture color={color} accent={accent} />;
    case 'leather':
      return <LeatherTexture color={color} accent={accent} />;
    case 'paper':
      return <PaperTexture color={color} accent={accent} />;
    default:
      return null;
  }
}
