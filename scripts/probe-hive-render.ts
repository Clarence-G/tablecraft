#!/usr/bin/env tsx
/**
 * Reproduce the hive "blank brown rectangle" bug:
 * inventory panel is gated on isMyTurn, so the non-current player sees nothing
 * at game start (no tiles, no inventory). This probe spins up a 2-bot hive
 * room, injects each bot's identity, and screenshots both views.
 *
 * Usage: pnpm tsx scripts/probe-hive-render.ts [--headed] [--after]
 *   --after : use this flag after applying the fix (changes assertion bar)
 */
import { chromium } from '@playwright/test';

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';

const headed = process.argv.includes('--headed');
const afterFix = process.argv.includes('--after');
const tag = afterFix ? 'after' : 'before';

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

async function capture(
  roomId: string,
  label: 'host' | 'guest',
  identity: { userId: string; userName: string },
) {
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((id: { userId: string; userName: string }) => {
    localStorage.setItem('tabletop:identity', JSON.stringify(id));
  }, identity);
  const page = await ctx.newPage();
  const url = `${CLIENT}/rooms/${roomId}/play`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const counts = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="game-board"]');
    const polygons = board ? board.querySelectorAll('polygon').length : 0;
    // inventory buttons have an inner SVG with an <image href="/game-icons/hive/...">
    const inventoryButtons = board
      ? Array.from(board.querySelectorAll('button[type="button"]')).filter((b) =>
          Array.from(b.querySelectorAll('image')).some((img) =>
            img.getAttribute('href')?.includes('/game-icons/hive/'),
          ),
        ).length
      : 0;
    return { polygons, inventoryButtons };
  });

  const shot = `/tmp/hive-${tag}-${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    `[${label}] inventoryButtons=${counts.inventoryButtons} polygons=${counts.polygons} screenshot=${shot}`,
  );
  await browser.close();
  return counts;
}

(async () => {
  const host = await getBot('HiveHost');
  const guest = await getBot('HiveGuest');
  console.log(`[tokens] host=${host.userId} guest=${guest.userId}`);

  const createRes = await postJson<{ ok: boolean; data?: { roomId: string }; error?: string }>(
    `${SERVER}/api/rooms`,
    { gameId: 'hive', force: true },
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
  console.log(`[join] ok=${joinRes.ok}${joinRes.error ? ` err=${joinRes.error}` : ''}`);

  const startRes = await postJson<{ ok: boolean; error?: string }>(
    `${SERVER}/api/rooms/${roomId}/start`,
    {},
    host.token,
  );
  console.log(`[start] ok=${startRes.ok}${startRes.error ? ` err=${startRes.error}` : ''}`);
  if (!startRes.ok) process.exit(1);

  const hostCounts = await capture(roomId, 'host', { userId: host.userId, userName: 'HiveHost' });
  const guestCounts = await capture(roomId, 'guest', {
    userId: guest.userId,
    userName: 'HiveGuest',
  });

  console.log('\n=== RESULT ===');
  console.log(`host inventory buttons  : ${hostCounts.inventoryButtons}  (expect 5)`);
  console.log(`guest inventory buttons : ${guestCounts.inventoryButtons}  (expect 5)`);

  const ok = hostCounts.inventoryButtons === 5 && guestCounts.inventoryButtons === 5;
  console.log(ok ? 'PASS: both players see full inventory' : 'FAIL: inventory missing');
  process.exit(ok ? 0 : 2);
})().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
