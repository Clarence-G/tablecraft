/**
 * Apply drizzle migrations to the database at DATABASE_URL.
 *
 * Usage:
 *   pnpm --filter @repo/server migrate
 *   # or with explicit URL:
 *   DATABASE_URL='postgres://user@localhost:5432/tablecraft_dev' \
 *     pnpm --filter @repo/server migrate
 *
 * Idempotent — safe to run repeatedly. drizzle-orm uses `__drizzle_migrations`
 * bookkeeping to skip already-applied migrations.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is required. See .env.example.');
  process.exit(1);
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'drizzle',
);

const sql = postgres(url, { onnotice: () => {} });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder });
  console.log(`[migrate] applied migrations from ${migrationsFolder}`);
} catch (err) {
  console.error('[migrate] migration failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
