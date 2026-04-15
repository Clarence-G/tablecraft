import type { Browser, Page } from '@playwright/test';

/**
 * Create a new browser context + page with an independent localStorage identity.
 * Each context is isolated — different userId and userName.
 */
export async function createPlayer(browser: Browser, name?: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();

  if (name) {
    await page.addInitScript((playerName: string) => {
      const nanoid = () => Math.random().toString(36).slice(2, 10);
      localStorage.setItem('identity', JSON.stringify({ userId: nanoid(), userName: playerName }));
    }, name);
  }

  return page;
}

/** Navigate to lobby, click the game card, wait for the room code to appear, return it. */
export async function createRoom(page: Page, gameId: string): Promise<string> {
  await page.goto('/');
  await page.click(`[data-testid="game-card-${gameId}"]`);
  await page.waitForSelector('[data-testid="room-code"]');
  const code = await page.textContent('[data-testid="room-code"]');
  return code?.trim();
}

/** Navigate to lobby, fill the room-code input, click join, wait for room page. */
export async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-testid="room-code-input"]', roomCode);
  await page.click('[data-testid="join-room-btn"]');
  await page.waitForSelector('[data-testid="room-page"]');
}

/** Click the ready button. */
export async function ready(page: Page): Promise<void> {
  await page.click('[data-testid="ready-btn"]');
}

/** Click the start button and wait for the game board to appear. */
export async function startGame(page: Page): Promise<void> {
  await page.click('[data-testid="start-btn"]');
  await page.waitForSelector('[data-testid="game-board"]');
}
