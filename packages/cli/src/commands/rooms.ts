import type { ApiClient } from '../lib/client.js';

export async function roomsListCommand(client: ApiClient, args: string[]): Promise<unknown> {
  let game: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' && args[i + 1]) {
      game = args[++i];
    }
  }
  const query = game ? `?game=${encodeURIComponent(game)}` : '';
  return client.get(`/rooms${query}`);
}

export async function roomsCreateCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const gameId = args[0];
  if (!gameId) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft rooms create <gameId>',
      hint: '',
    };
  }
  return client.post('/rooms', { gameId });
}

export async function roomsShowCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft rooms show <roomId>',
      hint: '',
    };
  }
  return client.get(`/rooms/${encodeURIComponent(roomId)}`);
}

export async function roomsJoinCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft rooms join <roomId>',
      hint: '',
    };
  }
  return client.post(`/rooms/${encodeURIComponent(roomId)}/join`, {});
}

export async function roomsLeaveCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft rooms leave <roomId>',
      hint: '',
    };
  }
  return client.post(`/rooms/${encodeURIComponent(roomId)}/leave`, {});
}

export async function roomsStartCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft rooms start <roomId>',
      hint: '',
    };
  }
  return client.post(`/rooms/${encodeURIComponent(roomId)}/start`, {});
}
