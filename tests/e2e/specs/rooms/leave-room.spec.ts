import { expect, test } from '@playwright/test';
import { IDENTITY_KEY, seedGuestIdentity } from '../../helpers/identity';
import { createRoom } from '../../helpers/rooms';

const APP = 'http://localhost:5173';

// Migration of tests/e2e/leave-room.spec.ts
// Fixes: uses correct 'tabletop:identity' localStorage key via seedGuestIdentity
// (the original spec used 'identity' key which was wrong and worked only by accident).
test.describe('Leave waiting room', () => {
  test('clicking leave returns user to lobby and stays there', async ({ page }) => {
    await seedGuestIdentity(page, { userName: 'Leaver' });
    await page.goto(APP);
    await page.waitForLoadState('networkidle');

    const code = await createRoom(page, 'gomoku');
    await expect(page).toHaveURL(new RegExp(`/rooms/${code}$`));

    // The actual regression: clicking leave used to bounce the user back because
    // the URL-sync effect saw stale roomCtx.room state.
    await page.click('[data-testid="leave-btn"]');

    await page.waitForURL(`${APP}/`, { timeout: 3000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${APP}/`);

    // Lobby is actually rendered
    await expect(page.locator('[data-testid="game-card-gomoku"]')).toBeVisible();
  });

  test('refresh inside a waiting room keeps the user there (auto-rejoin)', async ({ page }) => {
    await seedGuestIdentity(page, { userName: 'Rejoiner' });
    await page.goto(APP);
    await page.waitForLoadState('networkidle');

    const code = await createRoom(page, 'gomoku');
    const url = page.url();
    expect(url).toMatch(/\/rooms\/[A-Z0-9]{6}$/);

    await page.reload();
    await page.waitForSelector('[data-testid="room-page"]', { timeout: 5000 });
    await expect(page).toHaveURL(url);
  });
});
