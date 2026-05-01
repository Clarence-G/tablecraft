import { mkdirSync, existsSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../../');

/**
 * Start the TableCraft server with stdout + stderr piped to a log file.
 *
 * The returned `logPath` can be passed to requestPasswordReset() or any
 * other helper that needs to read server-side effects from the log.
 *
 * The server uses PGlite. Pass `dataDir` to use an isolated database directory
 * instead of the default `packages/server/data/pgdata`. Pass a unique `dataDir`
 * per test file for full DB isolation.
 *
 * Output format: when NODE_ENV is not 'production', pino-pretty is used.
 * Both formats include the email body text — regex extraction works for either.
 *
 * @example
 * ```ts
 * const { logPath, kill, serverUrl } = await startServerWithLog({ port: 13001 });
 * // ... run test ...
 * const token = await requestPasswordReset(page, email, logPath);
 * await kill();
 * ```
 */
export async function startServerWithLog(opts: {
  dataDir?: string;
  port?: number;
}): Promise<{ pid: number; logPath: string; kill: () => Promise<void> }> {
  const port = opts.port ?? 13001;
  // Unlike the production data dir (which uses PGlite's internal path),
  // DATABASE_URL here is the dataDir path for PGlite.
  const dataDir = opts.dataDir ?? join(REPO_ROOT, `tmp/e2e-server-${port}`);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const logDir = join(REPO_ROOT, 'tmp/e2e-logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const logPath = join(logDir, `server-${port}-${Date.now()}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const child = spawn(
    'pnpm',
    ['--filter', '@repo/server', 'exec', 'tsx', 'src/index.ts'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: dataDir,
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  // Wait for the server to signal readiness (health endpoint responds)
  await waitForServerReady(`http://localhost:${port}`, 15000);

  const kill = () =>
    new Promise<void>((resolve) => {
      child.once('exit', () => {
        logStream.end();
        resolve();
      });
      child.kill('SIGTERM');
      // Force kill after 5s if graceful shutdown stalls
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
    });

  return { pid: child.pid ?? 0, logPath, kill };
}

async function waitForServerReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${url}/api/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      // Server not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error(`startServerWithLog: server at ${url} did not become ready within ${timeoutMs}ms`);
}
