#!/usr/bin/env tsx
/**
 * Scaffold a new game directory from `games/_template/`.
 *
 * Usage:
 *   pnpm new:game <id> [--force]
 *
 * Produces a compiling skeleton at `games/<id>/`:
 *   - package.json with name `@games/<id>`
 *   - vitest.config.ts with test name `<id>`
 *   - shared.ts with `meta.id = '<id>'`
 *   - i18n/en.json and zh.json skeletons
 *
 * Then runs `pnpm gen:registry` to sync server-registry.ts and root deps.
 *
 * The agent/developer still edits shared.ts (action schema, meta fields),
 * logic.ts, Board.tsx, and the i18n files to build the actual game.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const templateDir = resolve(root, 'games/_template');
const gamesRoot = resolve(root, 'games');

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface ScaffoldOptions {
  force?: boolean;
  /** Skip `pnpm gen:registry` after scaffolding — used by tests. */
  skipRegistry?: boolean;
}

export function scaffoldGame(id: string, opts: ScaffoldOptions = {}): string {
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid game id "${id}". Must match /^[a-z][a-z0-9-]*$/ (kebab-case, starts with a letter).`,
    );
  }
  const targetDir = resolve(gamesRoot, id);

  if (existsSync(targetDir)) {
    if (!opts.force) {
      throw new Error(
        `games/${id}/ already exists. Pass --force to overwrite (will delete existing contents).`,
      );
    }
    console.log(`[new-game] Removing existing games/${id}/`);
    rmSync(targetDir, { recursive: true, force: true });
  }

  // cpSync copies the template tree. node_modules shouldn't exist in the
  // committed template, but filter just in case someone ran `pnpm install`
  // inside _template before scaffolding.
  cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (src) => !src.includes('node_modules'),
  });

  rewritePackageJson(targetDir, id);
  rewriteVitestConfig(targetDir, id);
  rewriteSharedTs(targetDir, id);
  ensureI18nSkeleton(targetDir);

  if (!opts.skipRegistry) {
    try {
      execSync('pnpm gen:registry', { cwd: root, stdio: 'inherit' });
    } catch (_err) {
      console.warn(
        '[new-game] `pnpm gen:registry` failed — run it manually after fixing the cause.',
      );
    }
  }

  return targetDir;
}

function rewritePackageJson(targetDir: string, id: string): void {
  const path = resolve(targetDir, 'package.json');
  const content = readFileSync(path, 'utf-8');
  const updated = content.replace('"@games/template"', `"@games/${id}"`);
  if (updated === content) {
    throw new Error(`package.json did not contain "@games/template" — template may be stale.`);
  }
  writeFileSync(path, updated);
}

function rewriteVitestConfig(targetDir: string, id: string): void {
  const path = resolve(targetDir, 'vitest.config.ts');
  const content = readFileSync(path, 'utf-8');
  const updated = content.replace(`name: 'template'`, `name: '${id}'`);
  if (updated === content) {
    throw new Error(`vitest.config.ts did not contain "name: 'template'" — template may be stale.`);
  }
  writeFileSync(path, updated);
}

function rewriteSharedTs(targetDir: string, id: string): void {
  const path = resolve(targetDir, 'shared.ts');
  const content = readFileSync(path, 'utf-8');
  const updated = content.replace(`id: 'template'`, `id: '${id}'`);
  if (updated === content) {
    throw new Error(`shared.ts did not contain "id: 'template'" — template may be stale.`);
  }
  writeFileSync(path, updated);
}

function ensureI18nSkeleton(targetDir: string): void {
  const skeleton = `${JSON.stringify({ name: '', description: '', tags: [], rules: '' }, null, 2)}\n`;
  for (const lang of ['en', 'zh']) {
    const path = resolve(targetDir, `i18n/${lang}.json`);
    if (!existsSync(path)) {
      writeFileSync(path, skeleton);
    }
  }
}

function printNextSteps(id: string): void {
  console.log('');
  console.log(`Created games/${id}/`);
  console.log('Now:');
  console.log(`  1. Edit games/${id}/shared.ts (meta, ActionSchema, PlayerView)`);
  console.log(`  2. Edit games/${id}/logic.ts (setup, onAction, getPlayerView)`);
  console.log(`  3. Edit games/${id}/Board.tsx (React UI)`);
  console.log(`  4. Edit games/${id}/i18n/*.json (display names and rules)`);
  console.log('  5. If you added new deps: pnpm install');
  console.log(`  6. Test: pnpm --filter @games/${id} test`);
}

// Entry point when run as a script (not when imported from tests).
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('Usage: pnpm new:game <id> [--force]');
    process.exit(1);
  }
  try {
    scaffoldGame(id, { force });
    printNextSteps(id);
  } catch (err) {
    console.error(`[new-game] ${(err as Error).message}`);
    process.exit(1);
  }
}
