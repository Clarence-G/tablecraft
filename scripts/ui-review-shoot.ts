#!/usr/bin/env tsx
/**
 * UI review screenshot pipeline.
 * Captures waiting + ingame frames for each target game at desktop + mobile.
 *
 * Usage: tsx scripts/ui-review-shoot.ts <outDir> <gameId> [gameId...]
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

interface ApiGame {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function getBotToken(name: string): Promise<string> {
  const j = await fetchJson<{ data: { token: string } }>(`${SERVER}/api/admin/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return j.data.token;
}

async function botJoin(token: string, roomId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`${SERVER}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
}

async function newPage(browser: Browser, vp: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('tablecraft:locale', 'zh');
    const id = Math.random().toString(36).slice(2, 8);
    localStorage.setItem(
      'tabletop:identity',
      JSON.stringify({ userId: `host-${id}`, userName: '主持人' }),
    );
  });
  return page;
}

async function createRoom(page: Page, gameId: string): Promise<string> {
  await page.goto(`${CLIENT}/games`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-testid="game-card-${gameId}"]`, { timeout: 10_000 });

  const cardSel = `[data-testid="game-card-${gameId}"]:not([disabled])`;
  let roomCode: string | undefined;
  for (let attempt = 0; attempt < 2 && !roomCode; attempt++) {
    await page.click(cardSel);
    try {
      await page.waitForSelector('[data-testid="room-code"]', { timeout: 8_000 });
      roomCode = (await page.textContent('[data-testid="room-code"]'))?.trim();
    } catch {
      if (attempt === 1) throw new Error(`room-code never appeared for ${gameId}`);
      await page.waitForTimeout(500);
    }
  }
  if (!roomCode) throw new Error(`no room code for ${gameId}`);
  return roomCode;
}

async function shootGame(
  browser: Browser,
  game: ApiGame,
  vp: { name: string; width: number; height: number },
  outDir: string,
): Promise<void> {
  const page = await newPage(browser, { width: vp.width, height: vp.height });
  const suffix = vp.name === 'mobile' ? '_mobile' : '_desktop';

  try {
    const roomCode = await createRoom(page, game.id);
    console.log(`  [${game.id}/${vp.name}] room=${roomCode}`);

    // Screenshot waiting room BEFORE bots join (pure host-waiting state)
    const waitingPath = `${outDir}/${game.id}_waiting${suffix}.png`;
    await page.screenshot({ path: waitingPath, fullPage: false });
    console.log(`  [${game.id}/${vp.name}] waiting -> ${waitingPath}`);

    // Have bots join
    const botCount = Math.max(0, game.minPlayers - 1);
    for (let i = 0; i < botCount; i++) {
      const tok = await getBotToken(`Bot${i + 1}-${game.id}-${vp.name}`);
      await botJoin(tok, roomCode);
    }

    await page.waitForTimeout(800);

    // Host and bots are both auto-ready on join — just wait for start-btn to enable
    // Wait for start button to be enabled, then start
    try {
      await page.waitForSelector('[data-testid="start-btn"]:not([disabled])', { timeout: 10_000 });
    } catch {
      await page.screenshot({ path: `${outDir}/${game.id}_waiting${suffix}-DEBUG.png` });
      throw new Error('start-btn never enabled — saved debug screenshot');
    }
    await page.click('[data-testid="start-btn"]');

    // Wait for game board to appear
    await page.waitForFunction(() => !document.querySelector('[data-testid="room-page"]'), null, {
      timeout: 15_000,
    });
    await page.waitForTimeout(5000);

    const ingamePath = `${outDir}/${game.id}_ingame${suffix}.png`;
    await page.screenshot({ path: ingamePath, fullPage: false });
    console.log(`  [${game.id}/${vp.name}] ingame -> ${ingamePath}`);
  } catch (err) {
    console.error(`  [${game.id}/${vp.name}] FAILED:`, err instanceof Error ? err.message : err);
    try {
      await page.screenshot({ path: `${outDir}/${game.id}_ingame${suffix}-ERROR.png` });
    } catch {}
    throw err;
  } finally {
    await page.context().close();
  }
}

async function main(): Promise<void> {
  const [outDir, ...gameIds] = process.argv.slice(2);
  if (!outDir || gameIds.length === 0) {
    console.error('Usage: tsx scripts/ui-review-shoot.ts <outDir> <gameId> [gameId...]');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const allGames = await fetchJson<{ data: ApiGame[] }>(`${SERVER}/api/games`);
  const known = new Map(allGames.data.map((g) => [g.id, g]));

  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];

  try {
    for (const gameId of gameIds) {
      const game = known.get(gameId);
      if (!game) {
        console.error(`Unknown game: ${gameId}`);
        failures.push(gameId);
        continue;
      }
      for (const vp of VIEWPORTS) {
        console.log(`\n=== ${gameId} / ${vp.name} ===`);
        try {
          await shootGame(browser, game, vp, outDir);
        } catch {
          failures.push(`${gameId}/${vp.name}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Failures: ${failures.length > 0 ? failures.join(', ') : 'none'}`);
  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
