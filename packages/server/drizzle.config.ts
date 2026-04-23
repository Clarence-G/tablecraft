import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    // Scratch DB folder used only by drizzle-kit introspection / generation.
    // Runtime DB path is set via DATABASE_URL (see src/db/index.ts).
    url: './data/pgdata',
  },
});
