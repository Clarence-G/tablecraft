import { test, expect } from '@playwright/test';
import { signUpEmail } from '../../helpers/auth';
import zh from '../../../../packages/client/src/i18n/locales/zh/common.json' assert { type: 'json' };

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

test.describe('Social — friend request accept and unfriend flow', () => {
  test.fixme(
    'Alice sends request → Bob accepts → both see each other → Alice unfriends',
    // BUG: POST /api/auth/sign-up/email returns HTTP 500 on this dev server instance.
    // See docs/ISSUE_e2e-stage2b-social-leaderboard.md §Bugs for reproduction steps.
    async ({ browser }) => {
      const alice = uniqueUser('alice');
      const bob = uniqueUser('bob');
      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const alicePage = await ctx1.newPage();
      const bobPage = await ctx2.newPage();

      // BetterAuth auto-signs-in on signup
      await signUpEmail(alicePage, alice);
      await signUpEmail(bobPage, bob);

      // ── Alice: open lobby → open friends tab → search Bob → send request ──────
      await alicePage.goto('/');
      const alicePanel = alicePage.locator('[data-testid="lobby-side-panel-desktop"]');
      await alicePanel.waitFor({ timeout: 8000 });
      await alicePanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();

      const aliceSearch = alicePanel.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder);
      await aliceSearch.fill(bob.name);
      // Debounce is 300 ms; wait for Bob's name to appear in search results
      await alicePanel.locator(`text=${bob.name}`).waitFor({ timeout: 5000 });
      await alicePanel
        .getByRole('button', { name: zh.lobbyPanel.friends.actions.add })
        .first()
        .click();
      // Toast confirms
      await alicePanel
        .locator(`text=${zh.lobbyPanel.friends.toast.requestSent}`)
        .waitFor({ timeout: 3000 });

      // ── Bob: open lobby → open friends tab → incoming request → accept ─────────
      await bobPage.goto('/');
      const bobPanel = bobPage.locator('[data-testid="lobby-side-panel-desktop"]');
      await bobPanel.waitFor({ timeout: 8000 });
      await bobPanel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();

      await bobPanel
        .locator(`text=${zh.lobbyPanel.friends.incomingHeader}`)
        .waitFor({ timeout: 8000 });
      await bobPanel.locator(`text=${alice.name}`).waitFor({ timeout: 5000 });

      // Click the "Accept" button in Alice's incoming row
      const aliceIncomingRow = bobPanel.locator('div').filter({ hasText: alice.name });
      await aliceIncomingRow
        .getByRole('button', { name: zh.lobbyPanel.friends.actions.accept })
        .first()
        .click();
      await bobPanel
        .locator(`text=${zh.lobbyPanel.friends.toast.accepted}`)
        .waitFor({ timeout: 3000 });

      // After accept, incoming section gone; Alice still visible (now in friends list)
      await expect(
        bobPanel.locator(`text=${zh.lobbyPanel.friends.incomingHeader}`),
      ).toHaveCount(0);
      await expect(bobPanel.locator(`text=${alice.name}`)).toBeVisible();

      // ── Alice: reload → open friends tab → sees Bob ───────────────────────────
      // useFriends polls every 30 s; reload is faster for the test
      await alicePage.reload();
      const alicePanelR = alicePage.locator('[data-testid="lobby-side-panel-desktop"]');
      await alicePanelR.waitFor({ timeout: 8000 });
      await alicePanelR.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
      await expect(alicePanelR.locator(`text=${bob.name}`)).toBeVisible({ timeout: 5000 });
      // Outgoing pending section should be gone
      await expect(
        alicePanelR.locator(`text=${zh.lobbyPanel.friends.outgoingHeader}`),
      ).toHaveCount(0);

      // ── Alice: unfriend Bob ───────────────────────────────────────────────────
      // The remove button is opacity-0 until the parent row is hovered.
      // aria-label is set, so getByRole finds it; {force:true} bypasses opacity check.
      const bobFriendRow = alicePanelR.locator('.group').filter({ hasText: bob.name });
      await bobFriendRow
        .getByRole('button', { name: zh.lobbyPanel.friends.actions.remove })
        .click({ force: true });
      await alicePanelR
        .locator(`text=${zh.lobbyPanel.friends.toast.removed}`)
        .waitFor({ timeout: 3000 });
      await expect(alicePanelR.locator(`text=${bob.name}`)).toHaveCount(0);

      // ── Bob: reload → friends list empty ─────────────────────────────────────
      await bobPage.reload();
      const bobPanelR = bobPage.locator('[data-testid="lobby-side-panel-desktop"]');
      await bobPanelR.waitFor({ timeout: 8000 });
      await bobPanelR.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();
      // Empty state shown; Alice no longer listed
      await expect(
        bobPanelR.locator(`text=${zh.lobbyPanel.friends.empty.title}`),
      ).toBeVisible({ timeout: 5000 });
      await expect(bobPanelR.locator(`text=${alice.name}`)).toHaveCount(0);

      await ctx1.close();
      await ctx2.close();
    },
  );

  test('guest user sees sign-in CTA in friends tab, not friend search', async ({ page }) => {
    // No sign-in — plain guest session
    await page.goto('/');
    const panel = page.locator('[data-testid="lobby-side-panel-desktop"]');
    await panel.waitFor({ timeout: 8000 });
    await panel.getByRole('button', { name: zh.lobbyPanel.friends.tabLabel }).click();

    // Guest empty-state text
    await expect(
      panel.locator(`text=${zh.lobbyPanel.friends.guestEmpty}`),
    ).toBeVisible({ timeout: 5000 });
    // "Sign In" button links to login
    await expect(panel.getByRole('button', { name: zh.auth.signIn })).toBeVisible();
    // Friend search input is NOT rendered for guests
    await expect(
      panel.getByPlaceholder(zh.lobbyPanel.friends.searchPlaceholder),
    ).not.toBeVisible();
  });

  test('unauthenticated POST /api/friends/request returns 401', async ({ page }) => {
    // page starts as guest with no session cookie
    await page.goto('/');
    const resp = await page.request.post(`${SERVER_URL}/api/friends/request`, {
      data: { targetUserId: 'not-a-real-user' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp.status()).toBe(401);
  });
});
