#!/usr/bin/env tsx
/**
 * Screenshot every game board.
 */
import { chromium, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SERVER = 'http://localhost:3001';
const CLIENT = 'http://localhost:5173';
const OUT_DIR = '/Users/bytedance/Projects/boardgames/screenshots';

mkdirSync(OUT_DIR, { recursive: true });

const GAMES: Array<{ id: string; bots: number }> = [
  { id: 'battleship', bots: 1 },
  { id: 'blackjack', bots: 0 },
  { id: 'connect-four', bots: 1 },
  { id: 'gomoku', bots: 1 },
  { id: 'hive', bots: 1 },
  { id: 'liar-bar', bots: 1 },
  { id: 'love-letter', bots: 1 },
  { id: 'splendor', bots: 1 },
  { id: 'texas-holdem', bots: 1 },
  { id: 'uno', bots: 1 },
  { id: 'yahtzee', bots: 1 },
];

async function getBotToken(name: string): Promise<string> {
  const res = await fetch(`${SERVER}/api/admin/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const j = (await res.json()) as { data: { token: string } };
  return j.data.token;
}

async function botJoin(token: string, roomId: string): Promise<void> {
  const res = await fetch(`${SERVER}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  const j = (await res.json()) as { ok: boolean };
  if (!j.ok) throw new Error(`bot join failed: ${JSON.stringify(j)}`);
}

async function shootGame(
  browser: Browser,
  gameId: string,
  botCount: number,
  viewport: { width: number; height: number },
  suffix: string,
): Promise<void> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    localStorage.setItem(
      'tabletop:identity',
      JSON.stringify({
        userId: `host-${Math.random().toString(36).slice(2, 8)}`,
        userName: '主持人',
      }),
    );
  });

  try {
    await page.goto(CLIENT);
    await page.waitForSelector(`[data-testid="game-card-${gameId}"]`, { timeout: 10_000 });
    await page.click(`[data-testid="game-card-${gameId}"]`);

    // "创建新房间" (createRoom) is the main button; use exact text match to avoid the inner "创建房间" button
    await page.waitForSelector('button:text-is("创建新房间")', { timeout: 5_000 });
    await page.click('button:text-is("创建新房间")');
    await page.waitForSelector('[data-testid="room-code"]', { timeout: 10_000 });
    const roomCode = (await page.textContent('[data-testid="room-code"]'))?.trim();
    if (!roomCode) throw new Error(`no room code for ${gameId}`);
    console.log(`  [${gameId}] room=${roomCode}`);

    // Sanity check: verify the room is for the expected game
    const probeTok = await getBotToken('Probe');
    const probeRes = await fetch(`${SERVER}/api/rooms/${roomCode}`, {
      headers: { Authorization: `Bearer ${probeTok}` },
    });
    const probeJson = (await probeRes.json()) as { data?: { gameId?: string } };
    const actualGame = probeJson.data?.gameId;
    if (actualGame !== gameId) {
      throw new Error(`room ${roomCode} is for ${actualGame}, expected ${gameId}`);
    }

    for (let i = 0; i < botCount; i++) {
      const tok = await getBotToken(`Bot${i + 1}`);
      await botJoin(tok, roomCode);
    }

    await page.waitForTimeout(500);

    await page.click('[data-testid="ready-btn"]');

    await page.waitForSelector('[data-testid="start-btn"]:not([disabled])', { timeout: 10_000 });
    await page.click('[data-testid="start-btn"]');

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="room-page"]'),
      null,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(5000);

    const outPath = `${OUT_DIR}/${gameId}${suffix}.png`;
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  [${gameId}] saved -> ${outPath}`);
  } catch (err) {
    console.error(`  [${gameId}] FAILED:`, err instanceof Error ? err.message : err);
    try {
      await page.screenshot({ path: `${OUT_DIR}/${gameId}${suffix}-ERROR.png` });
    } catch {}
  } finally {
    await ctx.close();
  }
}

async function main() {
  const filter = process.argv[2];
  const mobile = process.argv.includes('--mobile');
  const viewport = mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 };
  const suffix = mobile ? '-mobile' : '';
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { id, bots } of GAMES) {
      if (filter && filter !== '--mobile' && id !== filter) continue;
      console.log(`\n=== ${id}${suffix} ===`);
      await shootGame(browser, id, bots, viewport, suffix);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
