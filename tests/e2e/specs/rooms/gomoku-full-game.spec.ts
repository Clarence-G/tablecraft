import { test, expect } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame } from '../../helpers/rooms';
import zh from '../../../../packages/client/src/i18n/locales/zh/common.json';

const APP = 'http://localhost:5173';

// Migrate of tests/e2e/gomoku.spec.ts
// Fixes: uses correct tabletop:identity key via seedGuestIdentity; uses testid/locale
// selectors instead of hardcoded Chinese text; removes unreliable waitForTimeout logic.
test.describe('Gomoku E2E — full game', () => {
  test('two players play gomoku and alice wins', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice' });
    await seedGuestIdentity(bob, { userName: 'Bob' });

    // Step 1: Alice creates a Gomoku room
    const code = await createRoom(alice, 'gomoku');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Step 2: Bob joins
    await joinRoomByCode(bob, code);

    // Both see each other in the player list
    await alice.waitForSelector('[data-testid="player-list"]', { timeout: 8000 });
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 10000 });
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 10000 });

    // Step 3: Both ready up
    await readyUp(alice);
    await readyUp(bob);

    // Step 4: Alice (host) starts game
    await startGame(alice);

    await bob.waitForSelector('[data-testid="game-board"]', { timeout: 8000 });

    // Step 5: Play moves — Alice builds vertical 5-in-a-row at col 7, rows 0-4
    // Bob plays safe at col 8 (no interference with Alice's win path)
    const moves: Array<{ player: typeof alice; row: number; col: number }> = [
      { player: alice, row: 0, col: 7 },
      { player: bob,   row: 0, col: 8 },
      { player: alice, row: 1, col: 7 },
      { player: bob,   row: 1, col: 8 },
      { player: alice, row: 2, col: 7 },
      { player: bob,   row: 2, col: 8 },
      { player: alice, row: 3, col: 7 },
      { player: bob,   row: 3, col: 8 },
      { player: alice, row: 4, col: 7 }, // Alice wins
    ];

    // Wait for Alice's cells to be interactive (she's the host = black = first player)
    await alice.waitForSelector('[data-row="0"][data-col="0"]:not([disabled])', { timeout: 8000 });
    await bob.waitForSelector('[data-testid="game-board"]', { timeout: 8000 });

    for (const { player, row, col } of moves) {
      // Wait for the cell to be enabled (it's this player's turn) and click
      const cell = player.locator(`[data-row="${row}"][data-col="${col}"]`);
      await cell.waitFor({ state: 'visible', timeout: 5000 });
      await cell.click();
      // Allow socket state to propagate to both players before the next move
      await player.waitForTimeout(500);
    }

    // Step 6: Verify game over — read win/loss strings from locale
    await alice.waitForSelector('[data-testid="game-over-modal"]', { timeout: 8000 });
    await bob.waitForSelector('[data-testid="game-over-modal"]', { timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });
});
