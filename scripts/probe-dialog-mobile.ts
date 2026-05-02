#!/usr/bin/env tsx
/**
 * Verify GameActionDialog on mobile 375x667:
 * - Tap a game card (Battleship)
 * - Dialog hero shouldn't dominate the screen
 * - "创建房间" CTA must be visible and clickable within the viewport
 */
import { chromium } from '@playwright/test';

const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.message}`));

  console.log(`[nav] ${CLIENT}/`);
  await page.goto(`${CLIENT}/`, { waitUntil: 'networkidle', timeout: 15_000 });
  await page.waitForTimeout(1500);

  // Find a game card — click Battleship (战舰) tile
  const battleshipTile = page
    .locator('[data-testid^="game-card-"]')
    .filter({ hasText: '战舰' })
    .first();

  const tileCount = await page
    .locator('[data-testid^="game-card-"]')
    .count();
  console.log(`[tiles] total game tiles visible: ${tileCount}`);

  if (tileCount === 0) {
    console.log('[expand] no tiles visible, clicking 展开全部');
    const expandBtn = page.getByRole('button', { name: /展开全部/ });
    if ((await expandBtn.count()) > 0) {
      await expandBtn.first().click();
      await page.waitForTimeout(400);
    }
  }

  await battleshipTile.scrollIntoViewIfNeeded();
  await battleshipTile.click();
  console.log('[click] tapped battleship tile');
  await page.waitForTimeout(600);

  // Dialog should be open
  const dialog = page.locator('[data-slot="dialog-content"]');
  const dialogVisible = await dialog.isVisible();
  console.log(`[dialog] visible=${dialogVisible}`);

  // Get CTA button rect
  const ctaRect = await page
    .locator('[data-testid="dialog-create-room-btn"]')
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
      };
    })
    .catch((e) => ({ error: e.message }));

  const dialogRect = await dialog
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        maxHeight: cs.maxHeight,
        overflow: cs.overflow,
      };
    })
    .catch((e) => ({ error: e.message }));

  const hero = page.locator('[data-slot="dialog-content"] > div').first();
  const heroRect = await hero
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    })
    .catch((e) => ({ error: e.message }));

  console.log('\n=== LAYOUT ===');
  console.log('viewport: 375x667');
  console.log('dialog:', dialogRect);
  console.log('hero:', heroRect);
  console.log('cta:', ctaRect);

  const ctaInViewport =
    ctaRect && !('error' in ctaRect) && ctaRect.bottom <= 667 && ctaRect.y >= 0;
  console.log(`\n[assert] CTA visible in viewport = ${ctaInViewport}`);

  await page.screenshot({ path: '/tmp/dialog-mobile-375-before.png', fullPage: false });
  console.log('screenshot (before click) -> /tmp/dialog-mobile-375-before.png');

  // Try click CTA
  let clickable = false;
  try {
    await page
      .locator('[data-testid="dialog-create-room-btn"]')
      .click({ timeout: 2000 });
    clickable = true;
    console.log('[click] CTA clicked successfully');
    await page.waitForTimeout(500);
  } catch (e: any) {
    console.log(`[click] CTA click FAILED: ${e.message.slice(0, 120)}`);
  }

  console.log(`\n=== VERDICT ===`);
  console.log(`  Dialog opens:       ${dialogVisible}`);
  console.log(`  Hero reasonable:    ${heroRect && !('error' in heroRect) && heroRect.h <= 220}`);
  console.log(`  CTA in viewport:    ${ctaInViewport}`);
  console.log(`  CTA clickable:      ${clickable}`);
  console.log(`  Page errors:        ${pageErrors.length}`);

  await page.screenshot({ path: '/tmp/dialog-mobile-375.png', fullPage: false });
  console.log('screenshot -> /tmp/dialog-mobile-375.png');

  await browser.close();
  const pass =
    dialogVisible &&
    ctaInViewport &&
    clickable &&
    pageErrors.length === 0 &&
    heroRect &&
    !('error' in heroRect) &&
    heroRect.h <= 220;
  process.exit(pass ? 0 : 2);
})().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
