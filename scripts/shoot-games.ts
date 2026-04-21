#!/usr/bin/env tsx
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Screenshot every game board.
 *
 * Usage:
 *   tsx scripts/shoot-games.ts                     # all games, desktop
 *   tsx scripts/shoot-games.ts gomoku              # one game, desktop
 *   tsx scripts/shoot-games.ts gomoku uno          # multiple games, desktop
 *   tsx scripts/shoot-games.ts --mobile            # all games, mobile
 *   tsx scripts/shoot-games.ts gomoku --both       # gomoku, desktop + mobile
 *   tsx scripts/shoot-games.ts --list              # print discovered games and exit
 *   tsx scripts/shoot-games.ts --help
 *
 * Env: SERVER, CLIENT, OUT_DIR override defaults.
 */
import { type Browser, chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const SERVER = process.env.SERVER ?? 'http://localhost:3001';
const CLIENT = process.env.CLIENT ?? 'http://localhost:5173';
const OUT_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(repoRoot, 'screenshots');

interface ApiGame {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

interface CliArgs {
  gameIds: string[];
  viewports: Array<'desktop' | 'mobile'>;
  headed: boolean;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    gameIds: [],
    viewports: [],
    headed: false,
    list: false,
    help: false,
  };
  let mobile = false;
  let desktop = false;
  for (const a of argv) {
    switch (a) {
      case '--mobile':
        mobile = true;
        break;
      case '--desktop':
        desktop = true;
        break;
      case '--both':
        mobile = true;
        desktop = true;
        break;
      case '--headed':
        out.headed = true;
        break;
      case '--list':
        out.list = true;
        break;
      case '--help':
      case '-h':
        out.help = true;
        break;
      default:
        if (a.startsWith('--')) {
          throw new Error(`Unknown flag: ${a}`);
        }
        out.gameIds.push(a);
    }
  }
  if (mobile) out.viewports.push('mobile');
  if (desktop || !mobile) out.viewports.push('desktop');
  // dedupe + stable order: desktop first, then mobile
  out.viewports = Array.from(new Set(out.viewports)).sort((a, b) =>
    a === 'desktop' ? -1 : b === 'desktop' ? 1 : 0,
  );
  return out;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/shoot-games.ts [gameId...] [flags]

Flags:
  --mobile         shoot 375x812
  --desktop        shoot 1440x900 (default)
  --both           shoot both viewports
  --headed         run Chromium headed
  --list           list discovered games and exit
  --help, -h       this help

Env:
  SERVER (default ${SERVER})
  CLIENT (default ${CLIENT})
  OUT_DIR (default <repo>/screenshots)`);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function probeLiveness(): Promise<void> {
  try {
    await fetch(`${SERVER}/api/games`, { method: 'GET' });
  } catch {
    throw new Error(
      `Cannot reach server at ${SERVER}. Is \`pnpm dev\` running? Override with SERVER=...`,
    );
  }
  try {
    await fetch(CLIENT, { method: 'GET' });
  } catch {
    throw new Error(
      `Cannot reach client at ${CLIENT}. Is \`pnpm dev\` running? Override with CLIENT=...`,
    );
  }
}

async function listGames(): Promise<ApiGame[]> {
  const j = await fetchJson<{ data: ApiGame[] }>(`${SERVER}/api/games`);
  return j.data;
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
  const j = await fetchJson<{ ok: boolean }>(`${SERVER}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  if (!j.ok) throw new Error(`bot join failed: ${JSON.stringify(j)}`);
}

async function shootGame(
  browser: Browser,
  game: ApiGame,
  viewport: { width: number; height: number },
  suffix: string,
): Promise<void> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // Pin locale to zh so the "创建新房间" text selector matches regardless of
  // the runner's browser language.
  await page.addInitScript(() => {
    localStorage.setItem('tablecraft:locale', 'zh');
    const id = Math.random().toString(36).slice(2, 8);
    localStorage.setItem(
      'tabletop:identity',
      JSON.stringify({ userId: `host-${id}`, userName: '主持人' }),
    );
  });

  const botCount = Math.max(0, game.minPlayers - 1);

  try {
    await page.goto(CLIENT);
    await page.waitForSelector(`[data-testid="game-card-${game.id}"]`, { timeout: 10_000 });
    await page.click(`[data-testid="game-card-${game.id}"]`);

    // "创建新房间" is the main button; exact text match avoids the smaller "创建房间".
    // Click-then-wait is flaky under load (a stale click can land before React has
    // set selectedGameId, so the createRoom POST never fires and we hang on the
    // room-code selector). Retry the click once if navigation doesn't happen.
    const createBtn = 'button:text-is("创建新房间"):not([disabled])';
    await page.waitForSelector(createBtn, { timeout: 5_000 });
    let roomCode: string | undefined;
    for (let attempt = 0; attempt < 2 && !roomCode; attempt++) {
      await page.click(createBtn);
      try {
        await page.waitForSelector('[data-testid="room-code"]', { timeout: 8_000 });
        roomCode = (await page.textContent('[data-testid="room-code"]'))?.trim();
      } catch {
        if (attempt === 1) throw new Error(`room-code never appeared for ${game.id}`);
        console.log(`  [${game.id}] create-room click #${attempt + 1} did not navigate, retrying`);
        await page.waitForTimeout(500);
      }
    }
    if (!roomCode) throw new Error(`no room code for ${game.id}`);
    console.log(`  [${game.id}] room=${roomCode} bots=${botCount}`);

    const probeTok = await getBotToken('Probe');
    const probeJson = await fetchJson<{ data?: { gameId?: string } }>(
      `${SERVER}/api/rooms/${roomCode}`,
      { headers: { Authorization: `Bearer ${probeTok}` } },
    );
    const actualGame = probeJson.data?.gameId;
    if (actualGame !== game.id) {
      throw new Error(`room ${roomCode} is for ${actualGame}, expected ${game.id}`);
    }

    for (let i = 0; i < botCount; i++) {
      const tok = await getBotToken(`Bot${i + 1}`);
      await botJoin(tok, roomCode);
    }

    await page.waitForTimeout(500);

    await page.click('[data-testid="ready-btn"]');

    await page.waitForSelector('[data-testid="start-btn"]:not([disabled])', { timeout: 10_000 });
    await page.click('[data-testid="start-btn"]');

    await page.waitForFunction(() => !document.querySelector('[data-testid="room-page"]'), null, {
      timeout: 15_000,
    });
    await page.waitForTimeout(5000);

    const outPath = `${OUT_DIR}/${game.id}${suffix}.png`;
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  [${game.id}] saved -> ${outPath}`);
  } catch (err) {
    console.error(`  [${game.id}] FAILED:`, err instanceof Error ? err.message : err);
    try {
      await page.screenshot({ path: `${OUT_DIR}/${game.id}${suffix}-ERROR.png` });
    } catch {}
    throw err;
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  await probeLiveness();
  const allGames = await listGames();

  if (args.list) {
    for (const g of allGames) {
      console.log(`${g.id}  (${g.minPlayers}-${g.maxPlayers}p)  ${g.name}`);
    }
    return;
  }

  let games = allGames;
  if (args.gameIds.length > 0) {
    const known = new Set(allGames.map((g) => g.id));
    const missing = args.gameIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Unknown game id(s): ${missing.join(', ')}. Available: ${allGames.map((g) => g.id).join(', ')}`,
      );
    }
    const want = new Set(args.gameIds);
    games = allGames.filter((g) => want.has(g.id));
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  const failures: string[] = [];
  try {
    for (const viewport of args.viewports) {
      const vp = viewport === 'mobile' ? { width: 375, height: 812 } : { width: 1440, height: 900 };
      const suffix = viewport === 'mobile' ? '-mobile' : '';
      for (const game of games) {
        console.log(`\n=== ${game.id}${suffix} ===`);
        try {
          await shootGame(browser, game, vp, suffix);
        } catch {
          failures.push(`${game.id}${suffix}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\nDone. ${games.length * args.viewports.length - failures.length}/${games.length * args.viewports.length} shots succeeded.`,
  );
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
