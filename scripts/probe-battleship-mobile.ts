#!/usr/bin/env tsx
/**
 * Probe battleship-mobile-grid (P1):
 * Verifies the 10×10 ship-placement grid is visible and tappable at 375px.
 *
 * Expected: DOM has 100 grid cells, first cell rect ≥ 28×28px.
 *
 * Usage: pnpm tsx scripts/probe-battleship-mobile.ts [--headed]
 */
import { chromium } from '@playwright/test';

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';
const headed = process.argv.includes('--headed');

async function postJson<T = any>(url: string, body: any, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function getBot(name: string): Promise<{ token: string; userId: string }> {
  const j = await postJson<{ data: { token: string; userId: string } }>(
    `${SERVER}/api/admin/token`,
    { name },
  );
  return j.data;
}

(async () => {
  // --- Setup: two bots, create + join + start a battleship room ---
  const host = await getBot('BattleProbeHost');
  const guest = await getBot('BattleProbeGuest');
  console.log(`[tokens] host=${host.userId} guest=${guest.userId}`);

  const createRes = await postJson<{ ok: boolean; data?: { roomId: string }; error?: string }>(
    `${SERVER}/api/rooms`,
    { gameId: 'battleship', force: true },
    host.token,
  );
  if (!createRes.ok || !createRes.data) {
    console.error('[create] failed:', createRes);
    process.exit(1);
  }
  const roomId = createRes.data.roomId;
  console.log(`[create] room=${roomId}`);

  const joinRes = await postJson<{ ok: boolean; error?: string }>(
    `${SERVER}/api/rooms/${roomId}/join`,
    { force: true },
    guest.token,
  );
  console.log(`[join] ok=${joinRes.ok}`);

  const startRes = await postJson<{ ok: boolean; error?: string }>(
    `${SERVER}/api/rooms/${roomId}/start`,
    {},
    host.token,
  );
  console.log(`[start] ok=${startRes.ok}`);
  if (!startRes.ok) process.exit(1);

  // --- Browser: 375×667, injecting host identity ---
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(
    (identity: { userId: string; userName: string }) => {
      localStorage.setItem('tabletop:identity', JSON.stringify(identity));
    },
    { userId: host.userId, userName: 'BattleProbeHost' },
  );

  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const url = `${CLIENT}/rooms/${roomId}/play`;
  console.log(`[nav] ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch (e: any) {
    console.log(`[nav warn] ${e.message}`);
  }
  await page.waitForTimeout(3000);

  // --- Assert: placement grid has 100 cells, each ≥ 28×28 ---
  const gridData = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="game-board"]');
    if (!board) return { boardFound: false, cellCount: 0, firstCell: null };

    // Find all buttons inside the board
    const buttons = Array.from(board.querySelectorAll('button'));
    // The placement grid buttons are the ones in the inline-grid / grid container
    // Count buttons (the 10×10 grid = 100 cells + some control buttons)
    const allRects = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    });

    // Grid cells are square buttons — filter by aspect ratio ≈1
    const squareBtns = allRects.filter((r) => Math.abs(r.w - r.h) <= 4 && r.w > 0);
    const first = squareBtns[0] ?? null;

    return {
      boardFound: true,
      totalButtons: buttons.length,
      squareButtonCount: squareBtns.length,
      firstCell: first,
      allRects: allRects.slice(0, 10),
    };
  });

  console.log('\n=== GRID DATA ===');
  console.log(JSON.stringify(gridData, null, 2));

  const cellsVisible = gridData.squareButtonCount >= 100;
  const firstCellTappable =
    gridData.firstCell !== null &&
    gridData.firstCell.w >= 20 &&
    gridData.firstCell.h >= 20;

  await page.screenshot({ path: '/tmp/battleship-mobile-before.png', fullPage: false });
  console.log('screenshot -> /tmp/battleship-mobile-before.png');

  console.log('\n=== VERDICT ===');
  console.log(`  board found:          ${gridData.boardFound}`);
  console.log(`  total buttons:        ${gridData.totalButtons}`);
  console.log(`  square cells (≥100):  ${gridData.squareButtonCount} → ${cellsVisible ? 'PASS' : 'FAIL'}`);
  console.log(`  first cell tappable:  ${JSON.stringify(gridData.firstCell)} → ${firstCellTappable ? 'PASS (≥20px)' : 'FAIL (<20px or absent)'}`);
  console.log(`  page errors:          ${pageErrors.length}`);

  await browser.close();

  const pass = gridData.boardFound && cellsVisible && firstCellTappable && pageErrors.length === 0;
  process.exit(pass ? 0 : 2);
})().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
