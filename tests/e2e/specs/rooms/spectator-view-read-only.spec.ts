import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { seedGuestIdentity } from '../../helpers/identity';
import { createRoom, joinRoomByCode, readyUp, spectateRoom, startGame } from '../../helpers/rooms';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the locale string without ESM JSON import (Node.js 20 requires import assertions for JSON)
const zhCommon = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../packages/client/src/i18n/locales/zh/common.json'),
    'utf8',
  ),
) as { spectator: { banner: string } };

test.describe('Spectator view — read-only properties', () => {
  test('spectator wrapper has pointer-events-none, opacity-55, saturate-50 classes', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();
    const charlie = await ctx3.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-RO' });
    await seedGuestIdentity(bob, { userName: 'Bob-RO' });
    await seedGuestIdentity(charlie, { userName: 'Charlie-RO' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    await spectateRoom(charlie, code);

    const wrapper = charlie.locator('div[data-spectator="true"]');
    await expect(wrapper).toBeVisible({ timeout: 8000 });

    const classes = await wrapper.getAttribute('class');
    expect(classes).toContain('pointer-events-none');
    expect(classes).toContain('opacity-55');
    expect(classes).toContain('saturate-50');
    expect(await wrapper.getAttribute('aria-disabled')).toBe('true');

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test('spectator banner text matches locale string', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();
    const charlie = await ctx3.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-Banner' });
    await seedGuestIdentity(bob, { userName: 'Bob-Banner' });
    await seedGuestIdentity(charlie, { userName: 'Charlie-Banner' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    await spectateRoom(charlie, code);

    const banner = charlie.locator('[role="status"]');
    await expect(banner).toBeVisible({ timeout: 8000 });
    await expect(banner).toContainText(zhCommon.spectator.banner);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test('clicks inside spectator board do not change game state', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const alice = await ctx1.newPage();
    const bob = await ctx2.newPage();
    const charlie = await ctx3.newPage();

    await seedGuestIdentity(alice, { userName: 'Alice-NoSE' });
    await seedGuestIdentity(bob, { userName: 'Bob-NoSE' });
    await seedGuestIdentity(charlie, { userName: 'Charlie-NoSE' });

    const code = await createRoom(alice, 'gomoku');
    await joinRoomByCode(bob, code);
    await readyUp(alice);
    await readyUp(bob);
    await startGame(alice);

    await spectateRoom(charlie, code);

    // Click several cells inside Charlie's board, all at force (bypassing pointer-events)
    const cells = [
      '[data-row="5"][data-col="5"]',
      '[data-row="6"][data-col="6"]',
      '[data-row="7"][data-col="7"]',
    ];
    for (const sel of cells) {
      await charlie
        .locator(sel)
        .click({ force: true })
        .catch(() => {});
    }
    await charlie.waitForTimeout(600);

    // Alice's board must not have any stones at those positions from Charlie's clicks
    // (Alice is the current player; if her board changed, Charlie's clicks leaked)
    for (const sel of cells) {
      const occupied = await alice
        .locator(sel)
        .getAttribute('data-occupied')
        .catch(() => null);
      // Either null (attribute absent) or '0' / 'false' — not a truthy stone value
      expect(occupied ?? '0').not.toBe('1');
    }

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });
});
