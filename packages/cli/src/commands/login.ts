import { ApiClient } from '../lib/client.js';
import { saveConfig } from '../lib/config.js';

export async function loginCommand(args: string[]): Promise<unknown> {
  let server: string | undefined;
  let token: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) {
      server = args[++i];
    } else if (args[i] === '--token' && args[i + 1]) {
      token = args[++i];
    }
  }

  if (!server || !token) {
    return {
      ok: false,
      error: 'MISSING_ARGS',
      message: 'Usage: tablecraft login --server <url> --token <token>',
      hint: '',
    };
  }

  server = server.replace(/\/+$/, '');
  const client = new ApiClient({ server, token });
  const result = (await client.post('/auth/login')) as any;

  if (result.ok) {
    saveConfig({ server, token });
  }
  return result;
}

export async function whoamiCommand(client: ApiClient, server: string): Promise<unknown> {
  const result = (await client.post('/auth/login')) as any;
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, server } };
}
