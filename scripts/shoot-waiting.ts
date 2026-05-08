#!/usr/bin/env tsx
/**
 * Fast waiting-room screenshot for every game at desktop + mobile.
 * Uses server API to create rooms directly (bypasses UI socket timing),
 * then navigates the browser as a joined player to the /room/:id URL.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';
const OUT_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(repoRoot, 'screenshots-waiting');

interface ApiGame {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok)
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function getBotToken(
  name: string,
): Promise<{ token: string; userId: string; userName: string }> {
  const j = await fetchJson<{ data: { token: string; userId: string; userName: string } }>(
    `${SERVER}/api/admin/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  return j.data;
}

async function createRoom(token: string, gameId: string): Promise<string> {
  const j = await fetchJson<{ data: { roomId: string } }>(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, force: true }),
  });
  return j.data.roomId;
}

async function botJoin(token: string, roomId: string): Promise<void> {
  const j = await fetchJson<{ ok: boolean }>(`${SERVER}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  if (!j.ok) throw new Error(`bot join failed: ${JSON.stringify(j)}`);
}

async function botReady(token: string, roomId: string): Promise<void> {
  await fetch(`${SERVER}/api/rooms/${roomId}/ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ready: true }),
  }).catch(() => {});
}

async function startGame(token: string, roomId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`${SERVER}/api/rooms/${roomId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
}

async function shootGame(
  browser: Browser,
  game: ApiGame,
  vp: { width: number; height: number },
  suffix: string,
  ingame: boolean,
): Promise<void> {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  try {
    // Host is the browser viewer. Use a unique name per run so we never collide.
    const hostName = `Host-${game.id}-${Date.now().toString(36).slice(-4)}`;
    const host = await getBotToken(hostName);
    const roomId = await createRoom(host.token, game.id);
    await botJoin(host.token, roomId);

    // Fill with bots up to minPlayers.
    const botsNeeded = Math.max(0, game.minPlayers - 1);
    for (let i = 0; i < botsNeeded; i += 1) {
      const bot = await getBotToken(`Bot${i + 1}-${game.id}-${Date.now().toString(36).slice(-3)}`);
      await botJoin(bot.token, roomId);
      await botReady(bot.token, roomId);
    }

    // Inject the host's identity into localStorage so the client recognizes
    // the session as the host.
    await ctx.addInitScript(
      ({ userId, userName, token }) => {
        localStorage.setItem('tablecraft:locale', 'zh');
        localStorage.setItem('tabletop:identity', JSON.stringify({ userId, userName }));
        localStorage.setItem('tabletop:adminToken', token);
      },
      { userId: host.userId, userName: host.userName, token: host.token },
    );

    // If we need an ingame screenshot, ready host + start BEFORE navigating the
    // browser, so the client opens directly into /play and the server already
    // has game state ready. Waiting-room screenshots navigate without starting.
    if (ingame) {
      await botReady(host.token, roomId);
      const startRes = await fetch(`${SERVER}/api/rooms/${roomId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.token}` },
        body: '{}',
      });
      if (!startRes.ok) {
        const txt = await startRes.text().catch(() => '');
        console.warn(`    [${game.id}] start failed: ${startRes.status} ${txt.slice(0, 120)}`);
      }
    }

    await page.goto(`${CLIENT}/rooms/${roomId}`, { waitUntil: 'networkidle' });

    if (ingame) {
      // App sync will navigate to /rooms/:id/play because status='playing'.
      // Wait for the URL to land on /play.
      await page
        .waitForURL((u) => u.toString().includes('/play'), { timeout: 20_000 })
        .catch(() => {});
      // Wait for the loading spinner to clear.
      await page
        .waitForFunction(
          () => {
            const body = document.body?.innerText || '';
            return (
              body.length > 20 && !/^[\s·]*加载中/.test(body) && !/^Loading/i.test(body.trim())
            );
          },
          null,
          { timeout: 20_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(3000);
    } else {
      await page.waitForSelector('[data-testid="room-page"]', { timeout: 10_000 });
      await page.waitForTimeout(1000);
    }

    const out = `${OUT_DIR}/${game.id}${suffix}.png`;
    await page.screenshot({ path: out, fullPage: false });
    console.log(`  [${game.id}${suffix}] OK`);
  } catch (err) {
    console.error(`  [${game.id}${suffix}] FAILED: ${err instanceof Error ? err.message : err}`);
    try {
      await page.screenshot({ path: `${OUT_DIR}/${game.id}${suffix}-ERROR.png` });
    } catch {}
  } finally {
    await ctx.close();
  }
}

async function shootLobby(
  browser: Browser,
  vp: { width: number; height: number },
  suffix: string,
): Promise<void> {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('tablecraft:locale', 'zh');
      const id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem(
        'tabletop:identity',
        JSON.stringify({ id, name: `Host${id.slice(0, 3)}`, avatar: null }),
      );
    });
    await page.goto(CLIENT, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT_DIR}/lobby${suffix}.png`, fullPage: true });
    console.log(`  [lobby${suffix}] OK`);

    // Also shoot /games (full game list).
    await page.goto(`${CLIENT}/games`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/games-list${suffix}.png`, fullPage: true });
    console.log(`  [games-list${suffix}] OK`);
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lobbyOnly = args.includes('--lobby-only');
  const ingame = args.includes('--ingame');
  const onlyIds = args.filter((a) => !a.startsWith('--'));

  mkdirSync(OUT_DIR, { recursive: true });

  const { data: games } = await fetchJson<{ data: ApiGame[] }>(`${SERVER}/api/games`);
  const targets = onlyIds.length > 0 ? games.filter((g) => onlyIds.includes(g.id)) : games;

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of ['desktop', 'mobile'] as const) {
      const vp = viewport === 'mobile' ? { width: 375, height: 812 } : { width: 1440, height: 900 };
      const suffix = viewport === 'mobile' ? '-mobile' : '';
      console.log(`\n=== ${viewport} ===`);
      await shootLobby(browser, vp, suffix);
      if (!lobbyOnly) {
        for (const g of targets) {
          await shootGame(browser, g, vp, suffix, ingame);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
