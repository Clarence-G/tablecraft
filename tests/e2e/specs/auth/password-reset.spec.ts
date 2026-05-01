import { test, expect } from '@playwright/test';
import { signUpEmail, signInEmail, signOut, requestPasswordReset, resetPassword, E2EAuthError } from '../../helpers/auth';
import { resetDb } from '../../fixtures/db-reset';

// BUG: POST /api/auth/sign-up/email returns 500 on the running dev server.
// Password-reset tests depend on sign-up, so the happy-path tests are fixme.
// The negative scenario (invalid token) does NOT require sign-up and is enabled.
// See docs/ISSUE_e2e-stage2a-auth-rooms.md § Bugs found during testing.

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

  test.fixme('user can reset password via email token — BLOCKED: /api/auth/sign-up/email returns 500', async ({ page }) => {
    const email = uniqueEmail('pw-reset');
    const oldPassword = 'oldPassword1';
    const newPassword = 'newPassword2';

    await signUpEmail(page, { email, password: oldPassword, name: 'ResetUser', serverUrl: server.serverUrl });
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
      return json?.data?.user ?? null;
    }, server.serverUrl);
    expect(session).not.toBeNull();
    expect(session.email).toBe(email);
  });

  test.fixme('old password no longer works after reset — BLOCKED: /api/auth/sign-up/email returns 500', async ({ page }) => {
    const email = uniqueEmail('pw-old');
    const oldPassword = 'oldPass11';
    const newPassword = 'newPass22';

    await signUpEmail(page, { email, password: oldPassword, name: 'OldPassUser', serverUrl: server.serverUrl });
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
