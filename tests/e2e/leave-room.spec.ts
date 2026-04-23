import { expect, test } from '@playwright/test';

/**
 * Regression test for the bug where clicking "Leave" in the waiting room would
 * navigate to '/' but App.tsx's URL-sync effect would immediately yank the user
 * back into the room because roomCtx.room hadn't been cleared yet.
 *
 * Guards two layers:
 *   - Server emits room:left so the client drops cached room state.
 *   - App.tsx no longer auto-pulls users into a room from the lobby route.
 */
test.describe('Leave waiting room', () => {
  test('clicking leave returns user to lobby and stays there', async ({ page }) => {
    await page.addInitScript(() => {
      const id = `leave-test-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('identity', JSON.stringify({ userId: id, userName: 'Leaver' }));
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Pick gomoku → "Create gomoku room" CTA appears in the active-rooms section.
    await page.click('[data-testid="game-card-gomoku"]');
    await page.click('button:has-text("创建")');

    await page.waitForSelector('[data-testid="room-page"]');
    await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/);

    // The actual bug: clicking leave used to bounce the user back to /rooms/:id
    // within ~50ms because the sync effect saw stale roomCtx.room.
    await page.click('[data-testid="leave-btn"]');

    // Wait long enough that any bounce-back would have happened (the original
    // bug would re-navigate within one render frame).
    await page.waitForURL('/', { timeout: 3000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL('/');

    // And the lobby is actually rendered, not stuck mid-transition.
    await expect(page.locator('[data-testid="game-card-gomoku"]')).toBeVisible();
  });

  test('refresh inside a waiting room keeps the user there (auto-rejoin still works)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const id = `rejoin-test-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('identity', JSON.stringify({ userId: id, userName: 'Rejoiner' }));
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="game-card-gomoku"]');
    await page.click('button:has-text("创建")');
    await page.waitForSelector('[data-testid="room-page"]');

    const url = page.url();
    expect(url).toMatch(/\/rooms\/[A-Z0-9]{6}$/);

    await page.reload();
    await page.waitForSelector('[data-testid="room-page"]', { timeout: 5000 });
    await expect(page).toHaveURL(url);
  });
});
