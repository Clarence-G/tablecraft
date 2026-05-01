import { test, expect } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom } from '../../helpers/rooms';

// Actual game list from games/ directory (excluding _template and stub-only dirs).
// werewolf is excluded: games/werewolf/ has only package.json (no shared.ts/Board.tsx),
// so it never appears in the client registry and has no game-card testid.
// See docs/ISSUE_e2e-stage2a-auth-rooms.md § Bugs found during testing.
const GAME_IDS = [
  'battleship',
  'blackjack',
  'codenames',
  'connect-four',
  'gomoku',
  'hive',
  'liar-bar',
  'love-letter',
  'splendor',
  'texas-holdem',
  'undercover',
  'uno',
  // 'werewolf' — stub only (no shared.ts/Board.tsx), not in client registry
  'yahtzee',
];

test.describe('Cross-game smoke: waiting-room renders without crash', () => {
  for (const gameId of GAME_IDS) {
    test(`${gameId}: waiting room renders`, async ({ page }) => {
      test.setTimeout(30_000);

      await seedGuestIdentity(page, { userName: `Smoke-${gameId}` });

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(`PAGE_ERROR: ${err.message}`);
      });

      const code = await createRoom(page, gameId);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);

      // Waiting room must be visible (no white screen / crash)
      await expect(page.locator('[data-testid="room-page"]')).toBeVisible({ timeout: 8000 });

      // No JavaScript errors thrown during page load and room creation
      const criticalErrors = consoleErrors.filter(
        (e) =>
          !e.includes('Failed to load resource') && // ignore missing icons etc.
          !e.includes('favicon'),
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
