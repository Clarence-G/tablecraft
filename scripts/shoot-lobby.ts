#!/usr/bin/env tsx
/**
 * Screenshot the Lobby page (All Games section) for visual QA.
 *
 * Usage:
 *   tsx scripts/shoot-lobby.ts              # desktop + hover variant
 *   tsx scripts/shoot-lobby.ts --mobile     # mobile variant only
 *
 * Requires dev server running on :5173.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';
const OUT_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(repoRoot, 'screenshots', 'lobby');
mkdirSync(OUT_DIR, { recursive: true });

const wantMobile = process.argv.includes('--mobile');

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

async function shoot(
  viewport: { width: number; height: number },
  label: string,
  hoverCard?: boolean,
) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  console.log(`[>] ${label}: loading ${CLIENT}/`);
  await page.goto(CLIENT, { waitUntil: 'networkidle' });
  // Wait for at least one game card to render
  await page.waitForSelector('[data-testid^="game-card-"]', { timeout: 10_000 });
  // Give cover images a moment to decode
  await page.waitForTimeout(1500);

  const full = resolve(OUT_DIR, `lobby-${label}.png`);
  await page.screenshot({ path: full, fullPage: true });
  console.log(`    full -> ${full}`);

  // Zoom in on All-Games grid (first card area) for clarity
  const grid = page.locator('[data-testid="game-card-gomoku"]').first();
  if (await grid.count()) {
    const box = await grid.boundingBox();
    if (box) {
      // Scroll the grid into view
      await grid.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
  }

  if (hoverCard) {
    // Hover the gomoku card and capture the overlay animation
    const card = page.locator('[data-testid="game-card-gomoku"]');
    await card.hover();
    await page.waitForTimeout(500); // wait for CSS transition
    const hoverShot = resolve(OUT_DIR, `lobby-${label}-hover.png`);
    await page.screenshot({ path: hoverShot, fullPage: false });
    console.log(`    hover -> ${hoverShot}`);

    // Hover the Active Rooms carousel to show chevron buttons
    const roomsRow = page.locator('.group\\/row').first();
    if (await roomsRow.count()) {
      await roomsRow.hover();
      await page.waitForTimeout(400);
      const roomsShot = resolve(OUT_DIR, `lobby-${label}-rooms-hover.png`);
      await page.screenshot({ path: roomsShot, fullPage: false });
      console.log(`    rooms-hover -> ${roomsShot}`);
    }

    // Click the gomoku card to open the action dialog
    await card.click();
    await page.waitForTimeout(800); // dialog + animation settle
    const dialogShot = resolve(OUT_DIR, `lobby-${label}-dialog.png`);
    await page.screenshot({ path: dialogShot, fullPage: false });
    console.log(`    dialog -> ${dialogShot}`);
    // Close the dialog so subsequent screenshots don't inherit it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Also shoot just the visible viewport (above-the-fold)
  const aboveFold = resolve(OUT_DIR, `lobby-${label}-fold.png`);
  await page.screenshot({ path: aboveFold, fullPage: false });
  console.log(`    fold -> ${aboveFold}`);

  await browser.close();
}

async function main() {
  if (wantMobile) {
    await shoot(mobile, 'mobile');
  } else {
    await shoot(desktop, 'desktop', true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
