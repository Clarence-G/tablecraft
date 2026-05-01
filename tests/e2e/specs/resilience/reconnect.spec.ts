import { test, expect, type Page } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame } from '../../helpers/rooms';
import { dropSocket, reconnectSocket } from '../../helpers/socketDrop';

/**
 * Stage 3 — socket.io resilience.
 *
 * Validates that after a player's socket transport drops and reconnects:
 *   - the server runs markDisconnected on disconnect;
 *   - on reconnect the client receives room:state + game:state via the
 *     io.on('connection') auto-rejoin branch in packages/server/src/socket/handlers.ts;
 *   - the player's board still renders their prior moves and play continues.
 */

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

async function playMove(page: Page, row: number, col: number): Promise<void> {
  const c = cell(page, row, col);
  await c.waitFor({ state: 'visible', timeout: 5000 });
  await c.click();
}

async function expectStone(page: Page, row: number, col: number, color: 'black' | 'white') {
  // IntersectionBoard sets aria-label="${row+1},${col+1} (${color})" when occupied.
  const target = cell(page, row, col);
  await expect(target).toHaveAttribute('aria-label', `${row + 1},${col + 1} (${color})`, {
    timeout: 8000,
  });
}

test.describe('Socket resilience — reconnect flow', () => {
  test('player keeps game state across a socket drop', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();

    await seedGuestIdentity(alice, { userName: 'AliceReconnect' });
    await seedGuestIdentity(bob, { userName: 'BobReconnect' });

    // Setup: Alice creates, Bob joins, both ready, Alice starts.
    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await alice.waitForSelector('[data-testid="player-list"]', { timeout: 8000 });
    await expect(alice.getByText('BobReconnect')).toBeVisible({ timeout: 10000 });
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);
    await bob.waitForSelector('[data-testid="game-board"]', { timeout: 8000 });

    // Alice is host → black, plays first.
    await alice.waitForSelector('[data-row="0"][data-col="0"]:not([disabled])', { timeout: 8000 });
    await playMove(alice, 7, 7);
    // Both players must observe the stone before the drop so the server has
    // persisted the move (persistState runs on every applied action).
    await expectStone(alice, 7, 7, 'black');
    await expectStone(bob, 7, 7, 'black');

    // Drop Alice's socket.
    await dropSocket(alice);

    // Give the server a beat to run the disconnect handler (markDisconnected).
    // This is not user-facing latency — it's server-side bookkeeping.
    await alice.waitForTimeout(1000);

    // Reconnect Alice. Server's connection handler will re-emit room:state and
    // (since status === 'playing') game:state via the auto-rejoin branch.
    await reconnectSocket(alice);

    // Alice's board should still show her [7,7] move after the server replay.
    await expectStone(alice, 7, 7, 'black');

    // Play continues: it is Bob's turn (Alice just played). Bob plays [8,8],
    // Alice receives the update via the reconnected socket.
    await playMove(bob, 8, 8);
    await expectStone(alice, 8, 8, 'white');
    await expectStone(bob, 8, 8, 'white');

    // Then Alice can play — confirming her outbound socket works post-reconnect.
    await playMove(alice, 6, 6);
    await expectStone(alice, 6, 6, 'black');
    await expectStone(bob, 6, 6, 'black');

    await ctx1.close();
    await ctx2.close();
  });
});
