import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Connection string for a running Postgres. Defaults to a local superuser-owned
// DB on the developer's machine (Homebrew postgres@17 on macOS installs this by
// convention). Override with DATABASE_URL in .env for CI / staging / prod.
const DEFAULT_DATABASE_URL = 'postgres://bytedance@localhost:5432/tablecraft_dev';
const DATABASE_URL = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;

// `max: 10` is plenty for dev/small prod; BetterAuth + socket layer rarely
// holds long transactions.
const client = postgres(DATABASE_URL, { max: 10, onnotice: () => {} });
export const db = drizzle(client, { schema });

const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle');

export async function initDb(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

export async function closeDb(): Promise<void> {
  try {
    await client.end({ timeout: 5 });
  } catch (err) {
    console.warn('[db] close error (ignored):', err);
  }
}
