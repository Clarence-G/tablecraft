import type { Page } from '@playwright/test';
import zh from '../../../packages/client/src/i18n/locales/zh/common.json';

// ---------------------------------------------------------------------------
// testid-based selectors (preferred — locale-independent)
// ---------------------------------------------------------------------------
const SEL = {
  gameCard: (gameId: string) => `[data-testid="game-card-${gameId}"]`,
  roomPage: '[data-testid="room-page"]',
  roomCode: '[data-testid="room-code"]',
  readyBtn: '[data-testid="ready-btn"]',
  startBtn: '[data-testid="start-btn"]',
  leaveBtn: '[data-testid="leave-btn"]',
  gameBoard: '[data-testid="game-board"]',
  gameOverModal: '[data-testid="game-over-modal"]',
  // QuickJoinInput testids (from @repo/game-ui/input/QuickJoinInput.tsx)
  roomCodeInput: '[data-testid="quickjoin-input"]',
  joinSubmitBtn: '[data-testid="quickjoin-submit"]',
};

// ---------------------------------------------------------------------------
// zh-locale text fallbacks (used when testids are missing in production code)
// These are compile-time constants — switching the app locale does NOT affect
// the test selector. If you add a new locale, also add a fallback here.
// ---------------------------------------------------------------------------
const TEXT = {
  createRoom: zh.lobby?.createRoomShort ?? '创建房间',
  spectate: zh.lobby?.room?.spectate ?? '围观',
};

/**
 * Navigate to the lobby, click the game card, then create a new room.
 * Returns the room code (6-character alphanumeric string).
 *
 * Idempotent: NOT safe to call twice on the same page — calling it a second
 * time navigates back to the lobby and creates a second room.
 */
export async function createRoom(page: Page, gameId: string): Promise<string> {
  await page.goto('/');

  // Click the game card to filter active rooms for that game
  await page.click(SEL.gameCard(gameId));

  // Click the "Create room" button. Uses text fallback — no testid exists in
  // production yet. See ISSUE_e2e-stage1-infra.md for the needed testid.
  await page.click(`button:has-text("${TEXT.createRoom}")`);

  await page.waitForSelector(SEL.roomPage, { timeout: 8000 });
  await page.waitForSelector(SEL.roomCode, { timeout: 5000 });

  const code = await page.textContent(SEL.roomCode);
  if (!code?.trim()) throw new Error('createRoom: room code element found but text is empty');
  return code.trim();
}

/**
 * Navigate to the lobby and join an existing room by its 6-character code.
 *
 * Uses the QuickJoinInput component (testids: quickjoin-input, quickjoin-submit).
 */
export async function joinRoomByCode(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.fill(SEL.roomCodeInput, code);
  await page.click(SEL.joinSubmitBtn);
  await page.waitForSelector(SEL.roomPage, { timeout: 8000 });
}

/**
 * Navigate to a room as a spectator via the /rooms/:roomId/watch route.
 * The `code` here is the roomId (same as the room code shown in the UI).
 */
export async function spectateRoom(page: Page, code: string): Promise<void> {
  await page.goto(`/rooms/${code}/watch`);
  // Wait for the game board or some content indicating the spectator view loaded.
  // No dedicated spectator-wrapper testid exists yet. See ISSUE doc.
  await page.waitForSelector(SEL.gameBoard, { timeout: 8000 });
}

/**
 * Click the ready button. The button must be visible and not disabled.
 * Safe to call only when the room is in 'waiting' state.
 */
export async function readyUp(page: Page): Promise<void> {
  await page.waitForSelector(SEL.readyBtn, { timeout: 5000 });
  await page.click(SEL.readyBtn);
}

/**
 * Click the start button and wait for the game board to appear.
 * Only the host can start; this will throw if the element is disabled.
 */
export async function startGame(page: Page): Promise<void> {
  await page.waitForSelector(`${SEL.startBtn}:not([disabled])`, { timeout: 6000 });
  await page.click(SEL.startBtn);
  await page.waitForSelector(SEL.gameBoard, { timeout: 8000 });
}

/**
 * Click the leave button and wait for navigation back to the lobby ('/').
 */
export async function leaveRoom(page: Page): Promise<void> {
  await page.waitForSelector(SEL.leaveBtn, { timeout: 5000 });
  await page.click(SEL.leaveBtn);
  await page.waitForURL('/', { timeout: 5000 });
}

/**
 * Infer the room's current status from the page URL and visible DOM elements.
 *
 * - 'waiting' — room-page visible, no game board
 * - 'playing' — game-board visible
 * - 'ended'   — game-over-modal visible
 */
export async function getRoomStatus(page: Page): Promise<'waiting' | 'playing' | 'ended'> {
  const url = page.url();
  if (url.includes('/play')) {
    const boardVisible = await page.locator(SEL.gameBoard).isVisible().catch(() => false);
    if (boardVisible) return 'playing';
  }
  const gameOverVisible = await page.locator(SEL.gameOverModal).isVisible().catch(() => false);
  if (gameOverVisible) return 'ended';

  const boardVisible = await page.locator(SEL.gameBoard).isVisible().catch(() => false);
  if (boardVisible) return 'playing';

  return 'waiting';
}
