/// <reference types="vite/client" />
import type { ClientGamePlugin, GameMeta } from '@repo/shared';
import { type ComponentType, lazy } from 'react';

// Auto-discover games by scanning sibling directories of this file.
// Relative paths ensure Vite correctly code-splits each Board into its own
// async chunk (lazy loading). `_template` is filtered out by meta.id.
const sharedModules = import.meta.glob<{ meta: GameMeta }>('./*/shared.ts', {
  eager: true,
});
const boardModules = import.meta.glob<{ Board: ComponentType<unknown> }>('./*/Board.tsx');

function buildRegistry(): Record<string, ClientGamePlugin> {
  const registry: Record<string, ClientGamePlugin> = {};
  for (const [sharedPath, mod] of Object.entries(sharedModules)) {
    // Skip scaffolding directories (same convention as scripts/gen-registry.ts):
    // any folder whose name starts with "_" is treated as a template, not a game.
    if (/\/_[^/]+\/shared\.ts$/.test(sharedPath)) continue;
    const boardPath = sharedPath.replace(/shared\.ts$/, 'Board.tsx');
    const loader = boardModules[boardPath];
    if (!loader) continue;
    registry[mod.meta.id] = {
      meta: mod.meta,
      Board: lazy(async () => ({ default: (await loader()).Board })),
    };
  }
  return registry;
}

export const clientRegistry: Record<string, ClientGamePlugin> = buildRegistry();

