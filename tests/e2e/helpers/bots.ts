import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

const DEFAULT_SERVER_URL = 'http://localhost:3001';

export class BotError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BotError';
  }
}

/**
 * Mint a new bot token by calling POST /api/admin/token.
 * This endpoint requires no auth in dev (tokens are in-memory).
 *
 * @throws {BotError} if the server returns a non-2xx status
 */
export async function mintBotToken(opts: {
  name: string;
  serverUrl?: string;
}): Promise<{ token: string; userId: string }> {
  const url = `${opts.serverUrl ?? DEFAULT_SERVER_URL}/api/admin/token`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: opts.name }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any)?.message ?? String(res.status);
    throw new BotError(`mintBotToken: server returned ${res.status}: ${msg}`, res.status);
  }

  const json = await res.json();
  const data = json.data as { token: string; userId: string };
  return { token: data.token, userId: data.userId };
}

/**
 * Connect a socket.io-client as a bot (not a Playwright page).
 * Used for protocol-level tests that bypass the browser.
 *
 * The bot connects as a guest socket user using the userId returned by the
 * token store. Note: socket.io auth is guest-based; the bot token is only
 * verified by the REST API bearer middleware, not by the socket middleware.
 *
 * @param opts.token - Bot token from mintBotToken
 * @param opts.userId - Bot userId from mintBotToken (avoids an extra whoami call)
 * @param opts.botName - Display name for the bot (default: 'Bot')
 * @param opts.serverUrl - Override the server URL
 * @param opts.timeoutMs - Connection timeout (default: 5000ms)
 * @throws {BotError} if the socket fails to connect within timeoutMs
 */
export async function connectBotSocket(opts: {
  token: string;
  userId?: string;
  botName?: string;
  serverUrl?: string;
  timeoutMs?: number;
}): Promise<Socket> {
  const serverUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
  const timeoutMs = opts.timeoutMs ?? 5000;

  // Resolve userId: if not provided, fetch from whoami
  let userId = opts.userId;
  let botName = opts.botName ?? 'Bot';

  if (!userId) {
    const whoamiRes = await fetch(`${serverUrl}/api/bot/whoami`, {
      headers: { Authorization: `Bearer ${opts.token}` },
    });
    if (!whoamiRes.ok) {
      throw new BotError(`connectBotSocket: whoami returned ${whoamiRes.status}`);
    }
    const whoamiJson = await whoamiRes.json();
    userId = whoamiJson.data.userId as string;
    botName = (whoamiJson.data.name as string | undefined) ?? botName;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(
        new BotError(`connectBotSocket: timed out after ${timeoutMs}ms waiting for connection`),
      );
    }, timeoutMs);

    const socket = io(serverUrl, {
      auth: { userId, userName: botName, isGuest: true },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new BotError(`connectBotSocket: connection error: ${err.message}`));
    });
  });
}

/**
 * Emit a game:action event and wait for the server's game:state (ok) or
 * game:reject (error) response.
 *
 * Note: the server's game:action event does NOT use socket acks — responses
 * arrive via game:state or game:reject events. This helper wraps both into a
 * single Promise.
 *
 * @param socket - Connected bot socket
 * @param payload - Action payload (validated against the game's ActionSchema)
 * @param seq - Optional action sequence number (default: 0)
 * @param timeoutMs - Max wait time for a response (default: 5000ms)
 *
 * @throws if no response arrives within timeoutMs
 */
export async function botAction(
  socket: Socket,
  payload: unknown,
  seq = 0,
  timeoutMs = 5000,
): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:state', onState);
      socket.off('game:reject', onReject);
      reject(new BotError(`botAction: timed out after ${timeoutMs}ms waiting for game response`));
    }, timeoutMs);

    function onState() {
      clearTimeout(timer);
      socket.off('game:state', onState);
      socket.off('game:reject', onReject);
      resolve({ ok: true });
    }

    function onReject(reason: string) {
      clearTimeout(timer);
      socket.off('game:state', onState);
      socket.off('game:reject', onReject);
      resolve({ ok: false, error: { code: 'ACTION_REJECTED', message: reason } });
    }

    socket.once('game:state', onState);
    socket.once('game:reject', onReject);
    socket.emit('game:action', payload, seq);
  });
}
