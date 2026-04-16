import type { ApiClient } from '../lib/client.js';

export async function gameStateCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return { ok: false, error: 'MISSING_ARGS', message: 'Usage: tablecraft game state <roomId>', hint: '' };
  }
  return client.get(`/rooms/${encodeURIComponent(roomId)}/state`);
}

export async function gameActionCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  const actionJson = args[1];
  if (!roomId || !actionJson) {
    return { ok: false, error: 'MISSING_ARGS', message: 'Usage: tablecraft game action <roomId> \'<json>\'', hint: '' };
  }

  let action: unknown;
  try {
    action = JSON.parse(actionJson);
  } catch {
    return { ok: false, error: 'INVALID_JSON', message: 'Failed to parse action JSON', hint: 'Ensure the action is valid JSON' };
  }

  // Parse optional --seq
  let seq: number | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--seq' && args[i + 1]) { seq = Number(args[++i]); }
  }

  const body: Record<string, unknown> = { action };
  if (seq !== undefined) body.seq = seq;

  return client.post(`/rooms/${encodeURIComponent(roomId)}/action`, body);
}

export async function gameWaitCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return { ok: false, error: 'MISSING_ARGS', message: 'Usage: tablecraft game wait <roomId>', hint: '' };
  }

  let after: string | undefined;
  let timeout: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--after' && args[i + 1]) { after = args[++i]; }
    else if (args[i] === '--timeout' && args[i + 1]) { timeout = args[++i]; }
  }

  // Long poll loop: retry on timeout (changed: false) until actual change
  while (true) {
    const params = new URLSearchParams();
    if (after !== undefined) params.set('after', after);
    params.set('timeout', timeout || '30');
    const query = params.toString() ? `?${params}` : '';

    const result = await client.get(`/rooms/${encodeURIComponent(roomId)}/wait${query}`) as any;

    if (!result.ok) return result;

    if (result.data.changed) {
      return result;
    }

    // Timeout with no change -- keep polling
    if (result.data.seq !== undefined) {
      after = String(result.data.seq);
    }
  }
}
