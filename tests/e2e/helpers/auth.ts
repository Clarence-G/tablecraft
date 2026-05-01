import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * Base URL for the BetterAuth API. Matches VITE_API_URL default in the app.
 * Override by passing serverUrl to individual helpers if running against a
 * test-isolated server (see fixtures/server-log.ts).
 */
const DEFAULT_SERVER_URL = 'http://localhost:3001';

export class E2EAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'E2EAuthError';
  }
}

/**
 * Ensure the page is on the app origin so cross-origin CORS + credentials work.
 * If already there, this is a no-op.
 */
async function ensureAppOrigin(page: Page, baseUrl = 'http://localhost:5173'): Promise<void> {
  const current = page.url();
  if (!current.startsWith(baseUrl)) {
    await page.goto(baseUrl);
  }
}

/**
 * Sign up a new email account via direct BetterAuth API call.
 *
 * Stage 2 specs should use this for programmatic auth SETUP, not for testing
 * the UI signup form — use Playwright fill/click for UI flow tests.
 *
 * @throws {E2EAuthError} if the account already exists (409) or credentials are invalid
 */
export async function signUpEmail(
  page: Page,
  opts: { email: string; password: string; name: string; serverUrl?: string },
): Promise<void> {
  const apiUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
  await ensureAppOrigin(page);

  const result = await page.evaluate(
    async ({ url, email, password, name }) => {
      const res = await fetch(`${url}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    },
    { url: apiUrl, email: opts.email, password: opts.password, name: opts.name },
  );

  if (!result.ok) {
    const msg =
      (result.body as any)?.message ??
      (result.body as any)?.error?.message ??
      String(result.status);
    throw new E2EAuthError(`signUpEmail failed (${result.status}): ${msg}`, result.status, result.body);
  }
}

/**
 * Sign in with email+password via direct BetterAuth API call.
 *
 * @throws {E2EAuthError} if credentials are wrong
 */
export async function signInEmail(
  page: Page,
  opts: { email: string; password: string; serverUrl?: string },
): Promise<void> {
  const apiUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
  await ensureAppOrigin(page);

  const result = await page.evaluate(
    async ({ url, email, password }) => {
      const res = await fetch(`${url}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    },
    { url: apiUrl, email: opts.email, password: opts.password },
  );

  if (!result.ok) {
    const msg =
      (result.body as any)?.message ??
      (result.body as any)?.error?.message ??
      String(result.status);
    throw new E2EAuthError(`signInEmail failed (${result.status}): ${msg}`, result.status, result.body);
  }
}

/**
 * Sign out the current session.
 */
export async function signOut(page: Page, serverUrl = DEFAULT_SERVER_URL): Promise<void> {
  await ensureAppOrigin(page);

  await page.evaluate(async (url) => {
    await fetch(`${url}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    });
  }, serverUrl);
}

/**
 * Request a password-reset email. Returns the reset token extracted from the
 * server's console log (ConsoleTransport logs the email body including the URL).
 *
 * Only works when no RESEND_API_KEY is configured (default dev / test setup).
 * The server must have been started with stdout piped to `serverLogPath` —
 * use startServerWithLog() from fixtures/server-log.ts for this.
 *
 * @param page - Playwright page (used to call the BetterAuth API)
 * @param email - The email address to request a reset for
 * @param serverLogPath - Absolute path to the file where server stdout was piped
 * @param opts.serverUrl - Override the API base URL (default: http://localhost:3001)
 * @param opts.timeoutMs - Max time to wait for the token in the log (default: 5000)
 * @throws if the token is not found in the log within the timeout
 */
export async function requestPasswordReset(
  page: Page,
  email: string,
  serverLogPath: string,
  opts: { serverUrl?: string; redirectTo?: string; timeoutMs?: number } = {},
): Promise<string> {
  const apiUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
  const redirectTo = opts.redirectTo ?? 'http://localhost:5173/reset-password';
  const timeoutMs = opts.timeoutMs ?? 5000;

  await ensureAppOrigin(page);

  // Capture timestamp before request so we only look at new log lines
  const beforeMs = Date.now();

  await page.evaluate(
    async ({ url, email: em, redirectTo: redir }) => {
      await fetch(`${url}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: em, redirectTo: redir }),
      });
      // BetterAuth always returns 200 regardless of whether email exists
      // (prevents email enumeration)
    },
    { url: apiUrl, email, redirectTo },
  );

  // Poll the log file for the reset token URL
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    let content: string;
    try {
      content = readFileSync(serverLogPath, 'utf8');
    } catch {
      continue;
    }

    // BetterAuth 1.6 emits URL format: .../reset-password/<TOKEN>?callbackURL=...
    // (In older versions it was .../reset-password?token=<TOKEN>.)
    // Works with both pino-pretty (dev) and JSON (production) log formats.
    // Use matchAll + last match so repeat calls in the same server session
    // (multiple tests sharing one log file) pick up the newest token.
    const matches = [
      ...content.matchAll(/reset-password\/([\w-]+)\?callbackURL=/g),
      ...content.matchAll(/reset-password\?token=([\w_-]+)/g),
    ];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  }

  throw new Error(
    `requestPasswordReset: no reset token found in ${serverLogPath} within ${timeoutMs}ms for ${email}`,
  );
}

/**
 * Submit a new password using a reset token.
 *
 * @throws {E2EAuthError} if the token is invalid or expired
 */
export async function resetPassword(
  page: Page,
  opts: { token: string; newPassword: string; serverUrl?: string },
): Promise<void> {
  const apiUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
  await ensureAppOrigin(page);

  const result = await page.evaluate(
    async ({ url, token, newPassword }) => {
      const res = await fetch(`${url}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    },
    { url: apiUrl, token: opts.token, newPassword: opts.newPassword },
  );

  if (!result.ok) {
    const msg =
      (result.body as any)?.message ??
      (result.body as any)?.error?.message ??
      String(result.status);
    throw new E2EAuthError(`resetPassword failed (${result.status}): ${msg}`, result.status, result.body);
  }
}
