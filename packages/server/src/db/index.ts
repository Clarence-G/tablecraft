import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PGlite stores data on the local filesystem. DATABASE_URL is accepted for
// future compatibility with real Postgres, but for now it's just a directory
// path. Empty/unset → default under packages/server/data/pgdata so .gitignore
// keeps it out of the repo.
const DEFAULT_DATA_DIR = path.join(__dirname, '../../data/pgdata');
const DATA_DIR = process.env.DATABASE_URL?.trim() || DEFAULT_DATA_DIR;

// Probe the dataDir on first import. If pglite WASM aborts (corrupt FS left
// by a previous SIGKILL / incompatible Node version), rename the directory
// out of the way BEFORE the persistent `client` is bound, so app code can
// `import { db }` without worrying about lifecycle.
async function probeAndRotate(): Promise<void> {
  if (!existsSync(DATA_DIR)) return;
  const probe = new PGlite(DATA_DIR);
  try {
    await probe.query('SELECT 1');
    await probe.close();
  } catch (err) {
    try {
      await probe.close();
    } catch {}
    if (!isCorruptionError(err)) throw err;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${DATA_DIR}.crashed.${stamp}`;
    renameSync(DATA_DIR, backup);
    console.warn(`[db] corrupt dataDir detected — rotated to ${backup}`);
  }
}

function isCorruptionError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  return (
    msg.includes('Aborted()') ||
    msg.includes('_pg_initdb') ||
    msg.includes('WebAssembly') ||
    msg.includes('database files are incompatible')
  );
}

await probeAndRotate();

const client = new PGlite(DATA_DIR);
export const db = drizzle({ client, schema });

const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle');

export async function initDb(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

export async function closeDb(): Promise<void> {
  try {
    await client.close();
  } catch (err) {
    console.warn('[db] close error (ignored):', err);
  }
}
