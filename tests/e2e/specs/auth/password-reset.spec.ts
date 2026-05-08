import { expect, test } from '@playwright/test';
import { resetDb } from '../../fixtures/db-reset';
import {
  E2EAuthError,
  requestPasswordReset,
  resetPassword,
  signInEmail,
  signOut,
  signUpEmail,
} from '../../helpers/auth';

// Previously blocked by a server bug where POST /api/auth/sign-up/email returned
// HTTP 500 under pglite. Fixed in commit 77e2c07 (feat(stage1.5): migrate
// pglite to Postgres, fix BetterAuth 500). Happy-path tests re-enabled.

function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}@test.local`;
}

test.describe('Password reset flow', () => {
  let server: Awaited<ReturnType<typeof resetDb>>;

  test.beforeAll(async () => {
    server = await resetDb(13002);
  });

  test.afterAll(async () => {
    await server.kill();
  });

  test('user can reset password via email token', async ({ page }) => {
    const email = uniqueEmail('pw-reset');
    const oldPassword = 'oldPassword1';
    const newPassword = 'newPassword2';

    await signUpEmail(page, {
      email,
      password: oldPassword,
      name: 'ResetUser',
      serverUrl: server.serverUrl,
    });
    await signOut(page, server.serverUrl);

    const token = await requestPasswordReset(page, email, server.logPath, {
      serverUrl: server.serverUrl,
      redirectTo: 'http://localhost:5173/reset-password',
    });
    expect(token).toBeTruthy();

    await resetPassword(page, { token, newPassword, serverUrl: server.serverUrl });

    await signInEmail(page, { email, password: newPassword, serverUrl: server.serverUrl });
    const session = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/api/auth/get-session`, { credentials: 'include' });
      const json = await res.json();
      return json?.user ?? null;
    }, server.serverUrl);
    expect(session).not.toBeNull();
    expect(session.email).toBe(email);
  });

  test('old password no longer works after reset', async ({ page }) => {
    const email = uniqueEmail('pw-old');
    const oldPassword = 'oldPass11';
    const newPassword = 'newPass22';

    await signUpEmail(page, {
      email,
      password: oldPassword,
      name: 'OldPassUser',
      serverUrl: server.serverUrl,
    });
    await signOut(page, server.serverUrl);

    const token = await requestPasswordReset(page, email, server.logPath, {
      serverUrl: server.serverUrl,
    });
    await resetPassword(page, { token, newPassword, serverUrl: server.serverUrl });

    let threw = false;
    try {
      await signInEmail(page, { email, password: oldPassword, serverUrl: server.serverUrl });
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(E2EAuthError);
    }
    expect(threw).toBe(true);
  });
});

test.describe('Password reset — negative scenarios', () => {
  let server: Awaited<ReturnType<typeof resetDb>>;

  test.beforeAll(async () => {
    server = await resetDb(13003);
  });

  test.afterAll(async () => {
    await server.kill();
  });

  test('invalid / expired token is rejected', async ({ page }) => {
    let threw = false;
    try {
      await resetPassword(page, {
        token: 'invalid_token_xyz',
        newPassword: 'newPassword3',
        serverUrl: server.serverUrl,
      });
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(E2EAuthError);
    }
    expect(threw).toBe(true);
  });
});
