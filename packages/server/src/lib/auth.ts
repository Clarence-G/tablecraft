import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { emailTransport } from './email.js';
import { logger } from './logger.js';

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
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null; id: string }; url: string; token: string }) => {
      await emailTransport.send({
        to: user.email,
        subject: 'TableCraft — Reset your password',
        text: `Hi ${user.name || ''},\n\nReset your password:\n${url}\n\nLink expires in 1 hour.\nIf you didn't request this, ignore this email.`,
        html: `<p>Hi ${user.name || ''},</p><p><a href="${url}">Click here to reset your password</a></p><p>Link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
      });
    },
    onPasswordReset: async ({ user }: { user: { id: string } }) => {
      logger.info({ userId: user.id, mod: 'auth' }, 'password reset completed');
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await emailTransport.send({
        to: user.email,
        subject: 'TableCraft — Verify your email',
        text: `Click to verify:\n${url}`,
        html: `<p><a href="${url}">Verify your email</a></p>`,
      });
    },
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
