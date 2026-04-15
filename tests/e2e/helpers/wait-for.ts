import { type Page, expect } from '@playwright/test';

/** Wait for the game board to become visible. */
export async function waitForGameBoard(page: Page, timeout = 5000): Promise<void> {
  await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout });
}

/** Wait for the game-over modal to appear. */
export async function waitForGameOver(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.locator('[data-testid="game-over-modal"]')).toBeVisible({ timeout });
}
