import { test, expect } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame, spectateRoom } from '../../helpers/rooms';
import { mintBotToken, connectBotSocket } from '../../helpers/bots';

const APP = 'http://localhost:5173';

test.describe('Spectator mode — happy path', () => {
  test('Charlie can spectate an in-progress gomoku game', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();
    const charlie = await ctx3.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-Spectate' });
    await seedGuestIdentity(bob, { userName: 'Bob-Spectate' });
    await seedGuestIdentity(charlie, { userName: 'Charlie-Spectate' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    // Confirm game is underway for Alice
    await expect(alice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });

    // Charlie spectates via direct URL
    await spectateRoom(charlie, code);

    // Charlie should be at the /watch route
    expect(charlie.url()).toContain(`/rooms/${code}/watch`);

    // Game board is visible to Charlie
    await expect(charlie.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 8000 });

    // Spectator banner is visible
    await expect(charlie.locator('[role="status"]')).toBeVisible({ timeout: 5000 });

    // The spectator wrapper has pointer-events-none (read-only overlay)
    const spectatorDiv = charlie.locator('div[data-spectator="true"]');
    await expect(spectatorDiv).toBeVisible({ timeout: 5000 });
    const pointerEventsClass = await spectatorDiv.getAttribute('class');
    expect(pointerEventsClass).toContain('pointer-events-none');

    // Charlie tries to click a board cell — no state change on Alice's board
    const cellSelector = '[data-row="0"][data-col="0"]';
    const cellBeforeClick = await alice.locator(cellSelector).getAttribute('data-occupied').catch(() => null);
    await charlie.locator(cellSelector).click({ force: true }).catch(() => {});
    await charlie.waitForTimeout(500);
    const cellAfterClick = await alice.locator(cellSelector).getAttribute('data-occupied').catch(() => null);
    expect(cellAfterClick).toBe(cellBeforeClick);

    // Charlie navigates back to lobby
    await charlie.goto(APP);
    await expect(charlie).toHaveURL(`${APP}/`);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });
});

test.describe('Spectator mode — negative scenarios', () => {
  test('spectator socket emit of a game action is rejected server-side', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-SpectNeg' });
    await seedGuestIdentity(bob, { userName: 'Bob-SpectNeg' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    // Mint a bot token for Charlie (the spectator) and connect a raw socket
    const { token, userId: charlieId } = await mintBotToken({ name: 'CharlieSpectBot' });
    const charlieSocket = await connectBotSocket({ token, userId: charlieId, botName: 'CharlieSpectBot' });

    // Charlie's socket joins as spectator (room:spectate)
    // socket.io ack is single-arg — the server handler calls ack({ ok, data } | { ok: false, error }).
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('room:spectate timed out')), 5000);
      charlieSocket.emit('room:spectate', code, (response: { ok: boolean; error?: string }) => {
        clearTimeout(t);
        if (response?.ok) resolve();
        else reject(new Error(`room:spectate failed: ${response?.error}`));
      });
    });

    // Charlie's socket attempts a game action — must be rejected
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: true, error: 'timeout — no rejection received' }), 3000);
      charlieSocket.once('game:reject', (reason: string) => {
        clearTimeout(timer);
        resolve({ ok: false, error: reason });
      });
      charlieSocket.emit('game:action', { type: 'place', row: 3, col: 3 }, 0);
    });

    expect(result.ok).toBe(false);

    charlieSocket.disconnect();
    await ctx1.close();
    await ctx2.close();
  });
});
