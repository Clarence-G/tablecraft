/**
 * Refresh README hero screenshots against production tablecraft.aster.pub.
 * Captures 1 desktop + 1 mobile lobby shot.
 */
import { chromium, devices } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const PROD = 'https://tablecraft.aster.pub';
const OUT_DIR = '/Users/bytedance/Projects/boardgames/screenshots';

async function cap(name: string, viewport: { width: number; height: number }, device?: any) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(
    device
      ? { ...device, viewport, deviceScaleFactor: 2 }
      : { viewport, deviceScaleFactor: 2 },
  );
  const page = await ctx.newPage();
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Wait for tiles to render.
  await page.waitForSelector('[data-testid="game-tile"], .game-tile, a[href*="/rooms/"], [role="link"]', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  // Close any guest-welcome dialog if present.
  try {
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("知道了"), button:has-text("Got it")').first();
    if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
  } catch {}
  await page.waitForTimeout(500);
  const out = path.join(OUT_DIR, name);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`✓ ${out}`);
  await browser.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await cap('lobby-desktop.png', { width: 1280, height: 800 });
  await cap('lobby-mobile.png', { width: 390, height: 844 }, devices['iPhone 14']);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
