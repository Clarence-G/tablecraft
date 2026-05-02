#!/usr/bin/env tsx
/**
 * Screenshot the new Room (waiting room) layout.
 *
 * Creates a fresh room via the lobby UI, waits for navigation to /room view,
 * and captures both desktop and mobile variants.
 *
 * Requires dev server running on :5173.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';
const OUT_DIR = resolve(repoRoot, 'screenshots', 'room');
mkdirSync(OUT_DIR, { recursive: true });

async function openWaitingRoom(page: Page) {
  // /games page: clicking a card directly creates a room (bypasses lobby dialog).
  await page.goto(`${CLIENT}/games`, { waitUntil: 'networkidle' });
  const gomokuCard = page.getByRole('button', { name: /五子棋/ }).first();
  await gomokuCard.waitFor({ state: 'visible', timeout: 5000 });
  await gomokuCard.click();

  // Wait for waiting-room page
  await page.waitForSelector('[data-testid="room-page"]', { timeout: 15_000 });
  // Let cover image + fonts settle
  await page.waitForTimeout(2000);
}

async function shoot(viewport: { width: number; height: number }, label: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  console.log(`[>] ${label}: ${CLIENT}`);
  await openWaitingRoom(page);

  const out = resolve(OUT_DIR, `room-${label}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`    -> ${out}`);

  await browser.close();
}

async function main() {
  await shoot({ width: 1440, height: 900 }, 'desktop');
  await shoot({ width: 390, height: 844 }, 'mobile');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
