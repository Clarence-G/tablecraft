#!/usr/bin/env tsx
/**
 * Reproduce the 375px mobile "Something went wrong" crash (ISSUE P0).
 *
 * Creates a 2-bot game, starts it, injects one bot's identity into the
 * browser's localStorage (key `tabletop:identity`) so the socket connects as
 * that in-room player, then navigates to /play at 375x667 and captures any
 * pageerror / console.error.
 *
 * Usage: pnpm tsx scripts/probe-mobile-play.ts [gameId] [--headed] [--play|--watch]
 */
import { chromium } from '@playwright/test';

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const gameId = positional[0] ?? 'love-letter';
const headed = process.argv.includes('--headed');
const route = process.argv.includes('--watch') ? 'watch' : 'play';

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
  const host = await getBot('MobileHost3');
  const guest = await getBot('MobileGuest3');
  console.log(`[tokens] host.userId=${host.userId} guest.userId=${guest.userId}`);

  const createRes = await postJson<{ ok: boolean; data?: { roomId: string }; error?: string }>(
    `${SERVER}/api/rooms`,
    { gameId, force: true },
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

  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  // Inject host bot's identity BEFORE app mounts — useIdentity() reads this
  // key on first render. With the bot's userId, the socket handshake claims
  // to be an in-room player, so /play stops redirecting us to the lobby and
  // we exercise the exact GameRoute render path that users hit.
  await ctx.addInitScript(
    (identity: { userId: string; userName: string }) => {
      localStorage.setItem('tabletop:identity', JSON.stringify(identity));
    },
    { userId: host.userId, userName: 'MobileHost3' },
  );

  const page = await ctx.newPage();

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
  });

  const url = `${CLIENT}/rooms/${roomId}/${route}`;
  console.log(`[nav] ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch (e: any) {
    console.log(`[nav warn] ${e.message}`);
  }
  await page.waitForTimeout(4000);

  const bodyText = (await page.textContent('body')) ?? '';
  const crashed = bodyText.includes('Something went wrong');
  console.log('\n=== RESULT ===');
  console.log(`gameId=${gameId} route=${route} crashed=${crashed}`);
  console.log(`URL now: ${page.url()}`);
  console.log(`Body first 400:\n${bodyText.slice(0, 400)}`);
  console.log(`\n=== PAGE ERRORS (${pageErrors.length}) ===`);
  for (const e of pageErrors) console.log(e);
  console.log(`\n=== CONSOLE ERRORS (${consoleErrors.length}) ===`);
  for (const l of consoleErrors.slice(0, 30)) console.log(l);

  const shot = `/tmp/mobile-${gameId}-${route}-375.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`screenshot -> ${shot}`);

  await browser.close();
  process.exit(crashed ? 2 : 0);
})().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
