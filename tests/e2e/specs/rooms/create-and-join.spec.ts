import { test, expect } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame } from '../../helpers/rooms';
import { mintBotToken, connectBotSocket } from '../../helpers/bots';

const APP = 'http://localhost:5173';

test.describe('Create and join room — happy path', () => {
  test('Alice creates a room, Bob joins by code, both start game', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-CreateJoin' });
    await seedGuestIdentity(bob, { userName: 'Bob-CreateJoin' });

    const code = await createRoom(alice, 'gomoku');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    await joinRoomByCode(bob, code);

    // Alice sees Bob's name in the waiting room
    await alice.waitForSelector('[data-testid="player-list"]', { timeout: 8000 });
    await expect(alice.getByText('Bob-CreateJoin')).toBeVisible({ timeout: 8000 });

    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    await expect(alice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });
    await expect(bob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe('Create and join room — negative scenarios', () => {
  test('joining a non-existent room code shows an error and does not navigate', async ({ page }) => {
    await seedGuestIdentity(page, { userName: 'JoinFail' });
    await page.goto(APP);

    await page.fill('[data-testid="quickjoin-input"]', 'ZZZZZZ');
    await page.click('[data-testid="quickjoin-submit"]');

    // Should stay on lobby — no navigation to a room page
    await page.waitForTimeout(2000);
    expect(page.url()).toBe(`${APP}/`);

    // An error message should appear somewhere on the page
    const errorVisible = await page.locator('[role="alert"]').isVisible().catch(() => false) ||
      await page.locator('.text-destructive').isVisible().catch(() => false);
    expect(errorVisible).toBe(true);
  });

  test('third player cannot join a full 2-player gomoku room', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();
    const charlie = await ctx3.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-Full' });
    await seedGuestIdentity(bob, { userName: 'Bob-Full' });
    await seedGuestIdentity(charlie, { userName: 'Charlie-Full' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);

    // Charlie tries to join the now-full room
    await charlie.goto(APP);
    await charlie.fill('[data-testid="quickjoin-input"]', code);
    await charlie.click('[data-testid="quickjoin-submit"]');

    // Charlie should not get into the room page
    await charlie.waitForTimeout(2000);
    const url = charlie.url();
    expect(url).not.toMatch(new RegExp(`/rooms/${code}$`));

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });
});
