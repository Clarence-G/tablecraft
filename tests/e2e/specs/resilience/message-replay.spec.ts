import { type Page, expect, test } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, startGame } from '../../helpers/rooms';
import { dropSocket, reconnectSocket } from '../../helpers/socketDrop';

/**
 * Stage 3 — actions taken while a player is disconnected must be visible to
 * them on reconnect. The server persists state on every applied action
 * (GameRoom.persistState); on reconnect the io.on('connection') handler
 * re-emits the latest game:state via getPlayerView.
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
  const target = cell(page, row, col);
  await expect(target).toHaveAttribute('aria-label', `${row + 1},${col + 1} (${color})`, {
    timeout: 8000,
  });
}

test.describe('Socket resilience — message replay after reconnect', () => {
  test('player catches up on missed moves made while disconnected', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();

    await seedGuestIdentity(alice, { userName: 'AliceReplay' });
    await seedGuestIdentity(bob, { userName: 'BobReplay' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await alice.waitForSelector('[data-testid="player-list"]', { timeout: 8000 });
    await expect(alice.getByText('BobReplay')).toBeVisible({ timeout: 10000 });
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);
    await bob.waitForSelector('[data-testid="game-board"]', { timeout: 8000 });

    // Alice (host, black) plays [7,7]. After this, it's Bob's turn.
    await alice.waitForSelector('[data-row="0"][data-col="0"]:not([disabled])', { timeout: 8000 });
    await playMove(alice, 7, 7);
    await expectStone(bob, 7, 7, 'black');

    // Drop Alice before Bob plays.
    await dropSocket(alice);
    await alice.waitForTimeout(500); // let server run markDisconnected

    // Bob plays [5,5] while Alice is offline. Server persists; Alice's DOM
    // cannot receive the game:state emit because her socket is closed.
    // Gomoku turn order prevents 2 consecutive Bob moves, so we validate the
    // "missed at least 1 event" requirement with a single B move here.
    await playMove(bob, 5, 5);
    await expectStone(bob, 5, 5, 'white');

    // Sanity — Alice's DOM should not have [5,5] yet (she was disconnected).
    const aliceHasMissedMove = await cell(alice, 5, 5)
      .getAttribute('aria-label')
      .then((label) => label?.includes('white') ?? false);
    expect(aliceHasMissedMove).toBe(false);

    // Reconnect. Server auto-rejoin branch re-emits game:state for Alice.
    await reconnectSocket(alice);

    // Alice now sees BOTH stones: her own [7,7] (black) and Bob's [5,5] (white).
    await expectStone(alice, 7, 7, 'black');
    await expectStone(alice, 5, 5, 'white');

    // After Bob's [5,5], turn is back to Alice. She plays [6,6]; Bob sees it.
    await playMove(alice, 6, 6);
    await expectStone(alice, 6, 6, 'black');
    await expectStone(bob, 6, 6, 'black');

    await ctx1.close();
    await ctx2.close();
  });
});
