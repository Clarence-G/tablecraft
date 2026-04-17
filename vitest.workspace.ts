import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gamesDir = join(__dirname, 'games');

// Auto-discover every game that has its own vitest.config.ts (including _template).
const gameConfigs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((ent) => ent.isDirectory())
  .map((ent) => join(gamesDir, ent.name, 'vitest.config.ts'))
  .filter((p) => existsSync(p));

export default defineWorkspace([
  'packages/shared/vitest.config.ts',
  'packages/server/vitest.config.ts',
  'packages/client/vitest.config.ts',
  'scripts/vitest.config.ts',
  ...gameConfigs,
]);
