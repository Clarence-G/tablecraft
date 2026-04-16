import type { ApiClient } from '../lib/client.js';

export async function gamesListCommand(client: ApiClient): Promise<unknown> {
  return client.get('/games');
}

export async function gamesRulesCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const gameId = args[0];
  if (!gameId) {
    return { ok: false, error: 'MISSING_ARGS', message: 'Usage: tablecraft games rules <gameId>', hint: '' };
  }
  return client.get(`/games/${encodeURIComponent(gameId)}`);
}
