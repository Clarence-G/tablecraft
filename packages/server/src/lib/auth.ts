import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

const DEV_DEFAULT_SECRET = 'dev-insecure-secret-do-not-use-in-production-xxxxxxxxxxxxxxxxxxxx';

function requireSecret(): string {
  const v = process.env.BETTER_AUTH_SECRET;
  if (v && v.trim() !== '') return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing required env var BETTER_AUTH_SECRET in production');
  }
  console.warn('[auth] BETTER_AUTH_SECRET not set — using insecure dev default');
  return DEV_DEFAULT_SECRET;
}

const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';

const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

export const auth = betterAuth({
  secret: requireSecret(),
  baseURL: BASE_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Stage 2 scope: no email verification flow yet (spec §1.2 non-scope).
    requireEmailVerification: false,
  },
  ...(githubEnabled && {
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
  }),
  trustedOrigins: [BASE_URL, 'http://localhost:5173'],
});

export type Auth = typeof auth;
