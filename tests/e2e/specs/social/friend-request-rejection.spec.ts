import { expect, test } from '@playwright/test';
import zh from '../../../../packages/client/src/i18n/locales/zh/common.json' assert {
  type: 'json',
};
import { signUpEmail } from '../../helpers/auth';

const SERVER_URL = 'http://localhost:3001';

function uniqueUser(prefix: string) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return {
    email: `${prefix}-${ts}-${rand}@test.local`,
    password: 'secret123',
    name: `${prefix}${ts}`,
  };
}

test.describe('Social — friend request rejection', () => {
  test('Bob declines Alice request → row deleted → Alice can re-send', async ({ browser }) => {
    const alice = uniqueUser('rej-alice');
    const bob = uniqueUser('rej-bob');
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const alicePage = await ctx1.newPage();
    const bobPage = await ctx2.newPage();

    await signUpEmail(alicePage, alice);
    await signUpEmail(bobPage, bob);

    // ── Alice: send friend request to Bob via UI ───────────────────────────────
    await alicePage.goto('/');
    const alicePanel = alicePage.locator('[data-testid="lobby-side-panel-desktop"]');
    await alicePanel.waitFor({ timeout: 8000 });
    await alicePanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();

    await alicePanel.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder).fill(bob.name);
    await alicePanel.locator(`text=${bob.name}`).waitFor({ timeout: 5000 });
    await alicePanel
      .getByRole('button', { name: zh.lobbyPanel.friends.actions.add })
      .first()
      .click();
    await alicePanel
      .locator(`text=${zh.lobbyPanel.friends.toast.requestSent}`)
      .waitFor({ timeout: 3000 });
    // Alice sees outgoing request
    await expect(
      alicePanel.locator(`text=${zh.lobbyPanel.friends.outgoingHeader}`).first(),
    ).toBeVisible({ timeout: 5000 });

    // ── Bob: see incoming request → decline ───────────────────────────────────
    await bobPage.goto('/');
    const bobPanel = bobPage.locator('[data-testid="lobby-side-panel-desktop"]');
    await bobPanel.waitFor({ timeout: 8000 });
    await bobPanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();

    await bobPanel
      .locator(`text=${zh.lobbyPanel.friends.incomingHeader}`)
      .waitFor({ timeout: 8000 });
    await bobPanel.locator(`text=${alice.name}`).waitFor({ timeout: 5000 });

    const aliceIncomingRow = bobPanel.locator('div').filter({ hasText: alice.name });
    await aliceIncomingRow
      .getByRole('button', { name: zh.lobbyPanel.friends.actions.decline })
      .first()
      .click();
    await bobPanel
      .locator(`text=${zh.lobbyPanel.friends.toast.declined}`)
      .waitFor({ timeout: 3000 });

    // Bob sees no pending requests; friend list is empty
    await expect(bobPanel.locator(`text=${zh.lobbyPanel.friends.incomingHeader}`)).toHaveCount(0);
    await expect(bobPanel.locator(`text=${zh.lobbyPanel.friends.empty.title}`)).toBeVisible({
      timeout: 5000,
    });

    // ── Alice: reload → outgoing request gone (server deleted the row) ────────
    await alicePage.reload();
    const alicePanelR = alicePage.locator('[data-testid="lobby-side-panel-desktop"]');
    await alicePanelR.waitFor({ timeout: 8000 });
    await alicePanelR.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
    await expect(alicePanelR.locator(`text=${zh.lobbyPanel.friends.outgoingHeader}`)).toHaveCount(
      0,
    );

    // ── Alice: can re-send request (server has no cooldown after decline) ─────
    await alicePanelR.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder).fill(bob.name);
    await alicePanelR.locator(`text=${bob.name}`).waitFor({ timeout: 5000 });
    await expect(
      alicePanelR.getByRole('button', { name: zh.lobbyPanel.friends.actions.add }).first(),
    ).toBeVisible();

    // Click Add → server returns 200 (not 409; no block after plain decline)
    await alicePanelR
      .getByRole('button', { name: zh.lobbyPanel.friends.actions.add })
      .first()
      .click();
    await alicePanelR
      .locator(`text=${zh.lobbyPanel.friends.toast.requestSent}`)
      .waitFor({ timeout: 3000 });
    // Outgoing SECTION reappears with Bob in it. The outgoingHeader string
    // also appears as an italic relation-tag inside the search-result row,
    // so match on a <section> that contains both the header and bob.name.
    await expect(
      alicePanelR
        .locator('section')
        .filter({ hasText: zh.lobbyPanel.friends.outgoingHeader })
        .filter({ hasText: bob.name }),
    ).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('guest user cannot access the friends API (401)', async ({ page }) => {
    // No sign-in; page.request shares the (empty) cookie jar of this guest page
    await page.goto('/');

    // Attempt friends list — 401
    const listResp = await page.request.get(`${SERVER_URL}/api/friends`);
    expect(listResp.status()).toBe(401);

    // Attempt send request — 401
    const sendResp = await page.request.post(`${SERVER_URL}/api/friends/request`, {
      data: { targetUserId: 'irrelevant' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(sendResp.status()).toBe(401);

    // Attempt search — 401
    const searchResp = await page.request.get(`${SERVER_URL}/api/friends/search?q=someone`);
    expect(searchResp.status()).toBe(401);
  });

  test('no block-feature UI: decline only removes row, not block', async ({ browser }) => {
    const carol = uniqueUser('carol');
    const dave = uniqueUser('dave');
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const carolPage = await ctx1.newPage();
    const davePage = await ctx2.newPage();

    await signUpEmail(carolPage, carol);
    await signUpEmail(davePage, dave);

    // Carol sends request; Dave declines
    await carolPage.goto('/');
    const carolPanel = carolPage.locator('[data-testid="lobby-side-panel-desktop"]');
    await carolPanel.waitFor({ timeout: 8000 });
    await carolPanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
    await carolPanel.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder).fill(dave.name);
    await carolPanel.locator(`text=${dave.name}`).waitFor({ timeout: 5000 });
    await carolPanel
      .getByRole('button', { name: zh.lobbyPanel.friends.actions.add })
      .first()
      .click();
    await carolPanel
      .locator(`text=${zh.lobbyPanel.friends.toast.requestSent}`)
      .waitFor({ timeout: 3000 });

    await davePage.goto('/');
    const davePanel = davePage.locator('[data-testid="lobby-side-panel-desktop"]');
    await davePanel.waitFor({ timeout: 8000 });
    await davePanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
    await davePanel
      .locator(`text=${zh.lobbyPanel.friends.incomingHeader}`)
      .waitFor({ timeout: 8000 });
    const carolRow = davePanel.locator('div').filter({ hasText: carol.name });
    await carolRow
      .getByRole('button', { name: zh.lobbyPanel.friends.actions.decline })
      .first()
      .click();
    await davePanel
      .locator(`text=${zh.lobbyPanel.friends.toast.declined}`)
      .waitFor({ timeout: 3000 });

    // After decline, Dave can search Carol without a "blocked" error
    await davePage.reload();
    const davePanelR = davePage.locator('[data-testid="lobby-side-panel-desktop"]');
    await davePanelR.waitFor({ timeout: 8000 });
    await davePanelR.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
    await davePanelR.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder).fill(carol.name);
    await davePanelR.locator(`text=${carol.name}`).waitFor({ timeout: 5000 });
    // Add button visible → not blocked
    await expect(
      davePanelR.getByRole('button', { name: zh.lobbyPanel.friends.actions.add }).first(),
    ).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
