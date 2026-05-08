import { expect, test } from '@playwright/test';
import { IDENTITY_KEY, seedGuestIdentity } from '../../helpers/identity';
import { createRoom, readyUp, startGame } from '../../helpers/rooms';

const APP = 'http://localhost:5173';

test.describe('Guest flow', () => {
  test('auto-generated guest name appears in nav', async ({ page }) => {
    await seedGuestIdentity(page, { userName: 'GuestAlpha' });
    await page.goto('/');
    // The nav UserChip has aria-label="Sign in" when signed out (guest mode).
    // The HeroGuest section renders "你好，GuestAlpha" — use that as the check.
    await expect(page.getByText('GuestAlpha')).toBeVisible({ timeout: 8000 });
  });

  test('guest identity persists on page reload', async ({ page }) => {
    const { userId, userName } = await seedGuestIdentity(page, { userName: 'PersistGuest' });
    await page.goto('/');
    await expect(page.getByText('PersistGuest')).toBeVisible({ timeout: 8000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // After reload the seeded identity should still be in localStorage and shown
    const stored = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, IDENTITY_KEY);

    expect(stored?.userId).toBe(userId);
    expect(stored?.userName).toBe(userName);
    await expect(page.getByText('PersistGuest')).toBeVisible({ timeout: 8000 });
  });

  test('guest can create a room and see the game board', async ({ browser }) => {
    const ctx = await browser.newContext();
    const alice = await ctx.newPage();
    const bob = await ctx.newPage();

    await seedGuestIdentity(alice, { userName: 'GuestAliceHost' });
    await seedGuestIdentity(bob, { userName: 'GuestBobJoiner' });

    const code = await createRoom(alice, 'gomoku');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Bob joins
    await bob.goto('/');
    await bob.fill('[data-testid="quickjoin-input"]', code);
    await bob.click('[data-testid="quickjoin-submit"]');
    await bob.waitForSelector('[data-testid="room-page"]', { timeout: 8000 });

    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    await expect(alice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });
    await expect(bob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });

    await ctx.close();
  });
});
