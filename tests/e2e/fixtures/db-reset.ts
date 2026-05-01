import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServerWithLog } from './server-log';

export interface IsolatedServer {
  /** Port the isolated server is listening on */
  port: number;
  /** Absolute path to the server log file */
  logPath: string;
  /** Base URL for REST API requests to this server */
  serverUrl: string;
  /** Shut down and clean up the server process */
  kill: () => Promise<void>;
}

/**
 * Start a fully isolated server instance with its own temporary database.
 *
 * Use this in test.beforeEach (or beforeAll for a file-scoped server) when
 * you need clean DB state between tests.
 *
 * IMPORTANT: Browser-based Playwright tests CANNOT use this for isolation,
 * because the Vite dev client running at http://localhost:5173 is configured
 * at build time to talk to http://localhost:3001. Changing the server URL has
 * no effect on the browser client.
 *
 * This fixture is intended for:
 *   - Bot socket tests (Stage 3) that connect directly to serverUrl
 *   - Server-side API tests that use mintBotToken / raw fetch
 *   - Password-reset email extraction (serverLogPath is available)
 *
 * For browser e2e tests that need state isolation, use unique emails and room
 * codes per test instead of spinning up a new server.
 *
 * Option A (this implementation): spawn a fresh server with a unique DATA_DIR.
 * Option B (not implemented): call /api/admin/reset if that endpoint exists.
 * See ISSUE_e2e-stage1-infra.md → Infrastructure gaps for rationale.
 *
 * @param port - Port to listen on (default: 13001 to avoid conflicting with
 *               the dev server on 3001)
 */
export async function resetDb(port = 13001): Promise<IsolatedServer> {
  const dataDir = mkdtempSync(join(tmpdir(), 'tablecraft-e2e-'));

  const { pid, logPath, kill } = await startServerWithLog({
    dataDir,
    port,
  });

  void pid; // pid is available if callers need it for diagnostics

  return {
    port,
    logPath,
    serverUrl: `http://localhost:${port}`,
    kill,
  };
}
