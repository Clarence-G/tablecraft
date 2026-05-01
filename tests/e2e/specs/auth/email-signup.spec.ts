import { test, expect } from '@playwright/test';
import { signUpEmail, signInEmail, signOut, E2EAuthError } from '../../helpers/auth';

// Previously blocked by a server bug where POST /api/auth/sign-up/email returned
// HTTP 500 under pglite. Fixed in commit 77e2c07 (feat(stage1.5): migrate
// pglite to Postgres, fix BetterAuth 500).

const APP = 'http://localhost:5173';

function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}@test.local`;
}

test.describe('Email signup — happy path', () => {
  test('new user registers, sees their name, signs out, signs back in', async ({ page }) => {
    const email = uniqueEmail('signup-happy');
    const password = 'password123';
    const name = 'TestUser';

    await signUpEmail(page, { email, password, name });

    await page.goto(APP);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`[aria-label="${name}"]`)).toBeVisible({ timeout: 8000 });

    await signOut(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`[aria-label="${name}"]`)).not.toBeVisible({ timeout: 5000 });

    const sessionBefore = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/api/auth/get-session', { credentials: 'include' });
      const json = await res.json();
      return json?.user?.id ?? null;
    });
    await signInEmail(page, { email, password });
    const sessionAfter = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/api/auth/get-session', { credentials: 'include' });
      const json = await res.json();
      return json?.user?.id ?? null;
    });
    expect(sessionAfter).toBeTruthy();
    expect(sessionBefore).toBeNull();
  });

  test('signed-in user can navigate to /me and see their name', async ({ page }) => {
    const email = uniqueEmail('me-page');
    const name = 'MePageUser';
    await signUpEmail(page, { email, password: 'password123', name });
    await page.goto(`${APP}/me`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(name)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Email signup — negative scenarios', () => {
  test('duplicate email registration throws E2EAuthError', async ({ page }) => {
    const email = uniqueEmail('dup-email');
    await signUpEmail(page, { email, password: 'password123', name: 'FirstUser' });
    await signOut(page);

    let threw = false;
    try {
      await signUpEmail(page, { email, password: 'password456', name: 'SecondUser' });
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(E2EAuthError);
    }
    expect(threw).toBe(true);
  });

  test('wrong password on sign-in throws E2EAuthError', async ({ page }) => {
    const email = uniqueEmail('wrong-pw');
    await signUpEmail(page, { email, password: 'correctPassword1', name: 'WrongPassUser' });
    await signOut(page);

    let threw = false;
    try {
      await signInEmail(page, { email, password: 'wrongPassword9' });
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(E2EAuthError);
    }
    expect(threw).toBe(true);
  });
});
