#!/usr/bin/env node
// Copies skill_data/tablecraft-player/ → packages/cli/skills/tablecraft-player/
// Called from `pnpm build` so the skill ships in the npm tarball.
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../skill_data/tablecraft-player');
const dst = resolve(here, '../skills/tablecraft-player');

if (!existsSync(src)) {
  console.error(`[bundle-skill] source missing: ${src}`);
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`[bundle-skill] copied → ${dst}`);
