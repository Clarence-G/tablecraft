import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Per-test-file Postgres database. Each call:
 *   1. Connects to the `tablecraft_test` maintenance DB
 *   2. Creates a fresh `test_<random>` database on the same server
 *   3. Connects to it, applies all Drizzle migrations verbatim
 *   4. Returns a drizzle client + cleanup() that drops the DB
 *
 * Why DB-per-test-file rather than schema-per-test-file:
 *   - Drizzle migration 0002 hardcodes `"public"."user"` in FK declarations,
 *     so we can't transparently redirect all statements to a different schema
 *     via search_path.
 *   - `CREATE DATABASE ... TEMPLATE template0` is ~100ms on local pg@17,
 *     acceptable overhead for a test file (vs pglite's WASM init, which
 *     was 300-500ms per file).
 *   - Fully isolated — tests can't leak through shared sequences, roles,
 *     or system catalogs.
 *
 * Environment:
 *   - `TEST_DATABASE_URL` or `DATABASE_URL` must point at a Postgres whose
 *     role has CREATEDB privilege. Defaults to the dev Homebrew superuser.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle');

const RAW_URL =
  process.env.TEST_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  'postgres://bytedance@localhost:5432/tablecraft_test';

// We need to swap the database name in the connection string to reach the
// per-test DB. Use URL parsing to preserve user/host/port/params.
function buildUrl(dbName: string): string {
  const url = new URL(RAW_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

// The URL we connect to in order to issue `CREATE DATABASE` / `DROP DATABASE`.
// This must be some *other* DB on the same server (cannot drop a DB you're
// currently connected to). `tablecraft_test` serves as the maintenance DB.
const MAINTENANCE_URL = RAW_URL;

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>;
  dbName: string;
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated Postgres database, run all drizzle migrations, and
 * return a drizzle client bound to it. Pair with a matching `cleanup()`
 * in `afterEach`/`afterAll`.
 */
export async function createTestDb(): Promise<TestDb> {
  const dbName = `test_${randomBytes(6).toString('hex')}`;

  const admin = postgres(MAINTENANCE_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${dbName}" TEMPLATE template0`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const client = postgres(buildUrl(dbName), { max: 5, onnotice: () => {} });

  // Apply migrations verbatim. Drizzle writes `--> statement-breakpoint`
  // between DDL statements inside each file.
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await client.unsafe(stmt);
    }
  }

  const db = drizzle(client, { schema });

  async function cleanup(): Promise<void> {
    try {
      await client.end({ timeout: 5 });
    } catch {}
    const adm = postgres(MAINTENANCE_URL, { max: 1, onnotice: () => {} });
    try {
      // FORCE terminates any stragglers (postgres-js sometimes leaks a
      // connection under vitest's teardown race).
      await adm.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    } finally {
      await adm.end({ timeout: 5 });
    }
  }

  return { db, dbName, cleanup };
}
