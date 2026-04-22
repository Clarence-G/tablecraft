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

const client = new PGlite(DATA_DIR);
export const db = drizzle({ client, schema });

const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle');

export async function initDb(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
