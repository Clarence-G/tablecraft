import { type BrowserContext, type Page, expect, test } from '@playwright/test';

async function createPlayer(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('http://localhost:5173');
  await page.evaluate((playerName) => {
    const id = `player-${playerName}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('tabletop:identity', JSON.stringify({ userId: id, userName: playerName }));
  }, name);
  await page.reload();
  // Wait for the page to fully load and socket to connect
  await page.waitForSelector('text=桌游平台', { timeout: 10000 });
  await page.waitForTimeout(1500); // Give socket time to connect
  return page;
}

test.describe('Gomoku E2E — full game', () => {
  test('two players play gomoku and alice wins', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const alice = await createPlayer(ctx1, 'Alice');
    const bob = await createPlayer(ctx2, 'Bob');

    // ── Step 1: Alice creates a Gomoku room ──────────────────────────
    await alice.waitForSelector('text=五子棋', { timeout: 10000 });
    await alice.click('text=五子棋');
    await alice.waitForSelector('text=等待室', { timeout: 8000 });

    // Get room code
    const roomCode = await alice.locator('.font-mono').first().textContent({ timeout: 5000 });
    const code = roomCode?.trim();
    expect(code).toHaveLength(6);
    console.log('Room code:', code);

    // ── Step 2: Bob joins ─────────────────────────────────────────────
    await bob.fill('input[placeholder*="房间码"]', code);
    await bob.click('button:has-text("加入")');
    await bob.waitForSelector('text=等待室', { timeout: 8000 });

    // Both see each other
    await alice.waitForSelector('text=Bob', { timeout: 10000 });
    await bob.waitForSelector('text=Alice', { timeout: 10000 });
    console.log('Both players in room [OK]');

    // ── Step 3: Both ready ────────────────────────────────────────────
    await alice.click('button:has-text("准备")');
    await bob.click('button:has-text("准备")');
    await alice.waitForTimeout(500);

    // ── Step 4: Alice starts game ─────────────────────────────────────
    await alice.waitForSelector('button:has-text("开始游戏"):not([disabled])', { timeout: 6000 });
    await alice.click('button:has-text("开始游戏")');

    await alice.waitForSelector('[data-row="0"][data-col="0"]', { timeout: 8000 });
    await bob.waitForSelector('[data-row="0"][data-col="0"]', { timeout: 8000 });
    console.log('Game started [OK]');

    // ── Step 5: Play moves ────────────────────────────────────────────
    // Alice = black (moves first), Bob = white
    // Alice builds vertical 5-in-a-row at col 7, rows 0-4
    // Bob plays col 8 (safe, no threat to Alice's win)
    const moves: Array<{ player: Page; row: number; col: number }> = [
      { player: alice, row: 0, col: 7 },
      { player: bob, row: 0, col: 8 },
      { player: alice, row: 1, col: 7 },
      { player: bob, row: 1, col: 8 },
      { player: alice, row: 2, col: 7 },
      { player: bob, row: 2, col: 8 },
      { player: alice, row: 3, col: 7 },
      { player: bob, row: 3, col: 8 },
      { player: alice, row: 4, col: 7 }, // Alice wins
    ];

    for (const { player, row, col } of moves) {
      const cell = player.locator(`[data-row="${row}"][data-col="${col}"]`);
      await cell.waitFor({ state: 'visible', timeout: 5000 });
      await cell.click();
      await player.waitForTimeout(400);
      console.log(`  Move: row=${row} col=${col}`);
    }

    // ── Step 6: Verify game over ──────────────────────────────────────
    await alice.waitForSelector('text=你赢了', { timeout: 8000 });
    await bob.waitForSelector('text=第 2 名', { timeout: 8000 });

    console.log('E2E passed: Alice won!');

    await ctx1.close();
    await ctx2.close();
  });
});
