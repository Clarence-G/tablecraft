#!/usr/bin/env tsx
/**
 * UI review screenshot pipeline.
 * Captures waiting + ingame frames for each target game at desktop + mobile.
 * Codenames gets extra screenshots: setup phase + clue/guess phase.
 *
 * Usage: tsx scripts/ui-review-shoot.ts <outDir> <gameId> [gameId...]
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, type Page, chromium } from '@playwright/test';

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
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}: ${text}`);
  return JSON.parse(text) as T;
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

async function botAction(token: string, roomId: string, action: unknown): Promise<unknown> {
  const j = await fetchJson<{ ok: boolean; data?: unknown }>(
    `${SERVER}/api/rooms/${roomId}/action`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    },
  );
  if (!j.ok) throw new Error(`bot action failed: ${JSON.stringify(j)}`);
  return j.data;
}

async function getState<T = unknown>(token: string, roomId: string): Promise<T> {
  const j = await fetchJson<{ data: { view: T } }>(`${SERVER}/api/rooms/${roomId}/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return j.data.view;
}

async function newPage(
  browser: Browser,
  vp: { width: number; height: number },
): Promise<{ page: Page; ctx: BrowserContext }> {
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
  return { page, ctx };
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
  const { page, ctx } = await newPage(browser, { width: vp.width, height: vp.height });
  const suffix = vp.name === 'mobile' ? '_mobile' : '_desktop';

  try {
    const roomCode = await createRoom(page, game.id);
    console.log(`  [${game.id}/${vp.name}] room=${roomCode}`);

    // Have bots join (they auto-ready)
    const botCount = Math.max(0, game.minPlayers - 1);
    const botTokens: string[] = [];
    for (let i = 0; i < botCount; i++) {
      const tok = await getBotToken(`Bot${i + 1}-${game.id}-${vp.name}`);
      await botJoin(tok, roomCode);
      botTokens.push(tok);
    }
    await page.waitForTimeout(800);

    // Screenshot waiting room AFTER bots join (shows full player list)
    const waitingPath = `${outDir}/${game.id}_waiting${suffix}.png`;
    await page.screenshot({ path: waitingPath, fullPage: false });
    console.log(`  [${game.id}/${vp.name}] waiting -> ${waitingPath}`);

    // Host clicks Ready if the button is present
    const readyBtn = page.locator('[data-testid="ready-btn"]');
    if (await readyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await readyBtn.click();
    }

    // Wait for start button, then start
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
    await ctx.close();
  }
}

// Codenames-specific shooter: handles team-setup phase and clue/guess phase.
async function shootCodenames(
  browser: Browser,
  game: ApiGame,
  vp: { name: string; width: number; height: number },
  outDir: string,
): Promise<void> {
  const { page, ctx } = await newPage(browser, { width: vp.width, height: vp.height });
  const suffix = vp.name === 'mobile' ? '_mobile' : '_desktop';

  try {
    const roomCode = await createRoom(page, game.id);
    console.log(`  [codenames/${vp.name}] room=${roomCode}`);

    // 4 bots cover all 4 roles; host watches as unassigned spectator
    const [tok1, tok2, tok3, tok4] = await Promise.all([
      getBotToken(`CDBot1-${vp.name}`),
      getBotToken(`CDBot2-${vp.name}`),
      getBotToken(`CDBot3-${vp.name}`),
      getBotToken(`CDBot4-${vp.name}`),
    ]);
    await Promise.all([
      botJoin(tok1, roomCode),
      botJoin(tok2, roomCode),
      botJoin(tok3, roomCode),
      botJoin(tok4, roomCode),
    ]);
    await page.waitForTimeout(800);

    // Screenshot 1: Waiting room with all 4 players listed
    const waitingPath = `${outDir}/codenames_waiting${suffix}.png`;
    await page.screenshot({ path: waitingPath, fullPage: false });
    console.log(`  [codenames/${vp.name}] waiting -> ${waitingPath}`);

    // Host clicks Ready if present
    const readyBtn = page.locator('[data-testid="ready-btn"]');
    if (await readyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await readyBtn.click();
    }

    // Wait for start-btn and start
    await page.waitForSelector('[data-testid="start-btn"]:not([disabled])', { timeout: 10_000 });
    await page.click('[data-testid="start-btn"]');

    // Wait for board (setup phase)
    await page.waitForFunction(() => !document.querySelector('[data-testid="room-page"]'), null, {
      timeout: 15_000,
    });
    await page.waitForTimeout(2500);

    // Screenshot 2: Team-setup phase UI
    const setupPath = `${outDir}/codenames_setup${suffix}.png`;
    await page.screenshot({ path: setupPath, fullPage: false });
    console.log(`  [codenames/${vp.name}] setup -> ${setupPath}`);

    // Assign all 4 roles to bots — host stays unassigned
    await botAction(tok1, roomCode, { type: 'joinTeam', team: 'red', role: 'spymaster' });
    await page.waitForTimeout(200);
    await botAction(tok2, roomCode, { type: 'joinTeam', team: 'red', role: 'operative' });
    await page.waitForTimeout(200);
    await botAction(tok3, roomCode, { type: 'joinTeam', team: 'blue', role: 'spymaster' });
    await page.waitForTimeout(200);
    await botAction(tok4, roomCode, { type: 'joinTeam', team: 'blue', role: 'operative' });
    await page.waitForTimeout(600); // wait for UI to reflect all assignments

    // CommitTeams — bot1 (red spymaster) sends it
    const commitResult = (await botAction(tok1, roomCode, { type: 'commitTeams' })) as {
      view?: { phase?: string; activeTeam?: string };
    };
    console.log(
      `  [debug] commitTeams response phase=${JSON.stringify(commitResult?.view?.phase)} activeTeam=${JSON.stringify(commitResult?.view?.activeTeam)}`,
    );
    await page.waitForTimeout(2000);

    // Screenshot 3: Board in clue phase (board visible with team grid)
    const ingamePath = `${outDir}/codenames_ingame${suffix}.png`;
    await page.screenshot({ path: ingamePath, fullPage: false });
    console.log(`  [codenames/${vp.name}] ingame (clue phase) -> ${ingamePath}`);

    // Check which team goes first
    interface CellView {
      word: string;
      revealed: boolean;
      color: string | null;
    }
    interface StateView {
      board: CellView[];
      activeTeam: string;
      phase: string;
    }
    const stateAfterCommit = await getState<StateView>(tok1, roomCode);
    console.log(
      `  [debug] state from getState: phase=${stateAfterCommit.phase} activeTeam=${stateAfterCommit.activeTeam}`,
    );
    const firstTeam = stateAfterCommit.activeTeam;
    const firstSpyTok = firstTeam === 'red' ? tok1 : tok3;
    const firstOpTok = firstTeam === 'red' ? tok2 : tok4;

    // First team's spymaster gives a clue
    const preClueState = await getState<StateView>(firstSpyTok, roomCode);
    console.log(
      `  [debug] state right before giveClue: phase=${preClueState.phase} activeTeam=${preClueState.activeTeam} myRole=${(preClueState as { myRole?: string }).myRole} myTeam=${(preClueState as { myTeam?: string }).myTeam}`,
    );
    await botAction(firstSpyTok, roomCode, { type: 'giveClue', word: 'ANIMAL', count: 2 });
    await page.waitForTimeout(1000);

    // First team's operative guesses two cells of their color
    const st = await getState<StateView>(firstOpTok, roomCode);
    const targetCells = st.board
      .map((c, i) => ({ ...c, i }))
      .filter((c) => !c.revealed && c.color === firstTeam);
    if (targetCells.length >= 1) {
      await botAction(firstOpTok, roomCode, { type: 'guess', cellIndex: targetCells[0].i });
      await page.waitForTimeout(600);
    }
    if (targetCells.length >= 2) {
      await botAction(firstOpTok, roomCode, { type: 'guess', cellIndex: targetCells[1].i });
      await page.waitForTimeout(600);
    }
    await botAction(firstOpTok, roomCode, { type: 'endGuessing' }).catch(() => {});
    await page.waitForTimeout(500);

    // Second team's spymaster gives a clue
    const secondSpyTok = firstTeam === 'red' ? tok3 : tok1;
    const secondOpTok = firstTeam === 'red' ? tok4 : tok2;
    await botAction(secondSpyTok, roomCode, { type: 'giveClue', word: 'OCEAN', count: 1 });
    await page.waitForTimeout(1000);

    // Screenshot 4: Mid-game guessing phase — clue visible, some cells revealed
    const guessingPath = `${outDir}/codenames_guessing${suffix}.png`;
    await page.screenshot({ path: guessingPath, fullPage: false });
    console.log(`  [codenames/${vp.name}] guessing -> ${guessingPath}`);
  } catch (err) {
    console.error(`  [codenames/${vp.name}] FAILED:`, err instanceof Error ? err.message : err);
    try {
      await page.screenshot({ path: `${outDir}/codenames_ingame${suffix}-ERROR.png` });
    } catch {}
    throw err;
  } finally {
    await ctx.close();
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
          if (gameId === 'codenames') {
            await shootCodenames(browser, game, vp, outDir);
          } else {
            await shootGame(browser, game, vp, outDir);
          }
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
