#!/usr/bin/env tsx
import { chromium } from '@playwright/test';

const URL_TO_TEST = process.argv[2] || 'http://localhost:5173/rooms/VOEC0I/play';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  const errors: string[] = [];
  const logs: string[] = [];
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${err.stack}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(`[console.error] ${msg.text()}`);
  });

  try {
    await page.goto(URL_TO_TEST, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch (e: any) {
    console.log(`[goto failed] ${e.message}`);
  }

  // wait 2s for render
  await page.waitForTimeout(2000);

  const bodyText = (await page.textContent('body')) ?? '';
  console.log('=== VIEWPORT 375x667 ===');
  console.log(`URL: ${URL_TO_TEST}`);
  console.log(`Body contains "Something went wrong": ${bodyText.includes('Something went wrong')}`);
  console.log(`Body text (first 300 chars):\n${bodyText.slice(0, 300)}`);
  console.log('\n=== PAGE ERRORS ===');
  for (const e of errors) console.log(e);
  console.log('\n=== CONSOLE ERRORS ===');
  for (const l of logs) console.log(l);

  await page.screenshot({ path: '/tmp/mobile-crash-375.png', fullPage: true });
  console.log('\nscreenshot -> /tmp/mobile-crash-375.png');

  await browser.close();
})();
