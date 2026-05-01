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
 * Start an auxiliary server instance on a unique port that shares the
 * `tablecraft_test` Postgres database with other e2e tests.
 *
 * Use this in test.beforeAll when you need:
 *   - Access to server-side logs (e.g. password-reset emails)
 *   - A dedicated server URL that is NOT the dev server on :3001
 *
 * NOTE: The test DB is shared across callers. Tests should use unique emails,
 * room codes, etc. to avoid cross-contamination.
 *
 * Browser-based Playwright tests CANNOT use the `serverUrl` returned here for
 * isolation because the Vite dev client at :5173 is configured at build time to
 * talk to :3001. This fixture is intended for:
 *   - Password-reset email extraction via the server log file
 *   - Bot socket tests (Stage 3) that connect directly to serverUrl
 *   - Server-side API tests that use mintBotToken / raw fetch
 *
 * @param port - Port to listen on (default: 13001 to avoid conflicting with
 *               the dev server on 3001)
 */
export async function resetDb(port = 13001): Promise<IsolatedServer> {
  const { pid, logPath, kill } = await startServerWithLog({ port });

  void pid; // pid is available if callers need it for diagnostics

  return {
    port,
    logPath,
    serverUrl: `http://localhost:${port}`,
    kill,
  };
}
