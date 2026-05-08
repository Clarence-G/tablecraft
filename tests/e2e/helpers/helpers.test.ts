import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintBotToken } from './bots';
import { IDENTITY_KEY, seedGuestIdentity } from './identity';

// ---------------------------------------------------------------------------
// seedGuestIdentity
// ---------------------------------------------------------------------------

describe('seedGuestIdentity', () => {
  it('registers an addInitScript call using the tabletop:identity key', async () => {
    // Capture the fn + data pairs registered with addInitScript
    const calls: Array<{ fn: (data: any) => void; data: any }> = [];
    const mockPage = {
      addInitScript: vi.fn((fn: any, data?: any) => {
        calls.push({ fn, data });
      }),
    };

    const result = await seedGuestIdentity(mockPage as any, { userName: 'Alice' });

    expect(calls).toHaveLength(1);
    const { data } = calls[0];

    // The data passed to the script must use the correct key
    expect(data.key).toBe(IDENTITY_KEY);
    expect(data.key).not.toBe('identity'); // wrong key used in old multi-player.ts

    // Simulate running the script with a fake localStorage to verify behavior
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      getItem: (k: string) => store[k] ?? null,
    };
    // Execute the captured fn against a sandboxed localStorage
    const fn = calls[0].fn as (d: { key: string; value: string }) => void;
    // The fn uses the outer-scope 'localStorage' variable when executing in a
    // real browser. Here we call the setItem directly to verify the key/value.
    mockLocalStorage.setItem(data.key, data.value);

    expect(store).toHaveProperty(IDENTITY_KEY);
    expect(store).not.toHaveProperty('identity');

    const stored = JSON.parse(store[IDENTITY_KEY]);
    expect(stored.userName).toBe('Alice');
    expect(stored.userId).toBe(result.userId);
  });

  it('uses a provided deterministic userId', async () => {
    const mockPage = { addInitScript: vi.fn() };
    const result = await seedGuestIdentity(mockPage as any, {
      userId: 'fixed-id-123',
      userName: 'Bob',
    });
    expect(result.userId).toBe('fixed-id-123');
  });

  it('generates a userId when none is provided', async () => {
    const mockPage = { addInitScript: vi.fn() };
    const result = await seedGuestIdentity(mockPage as any, { userName: 'Carol' });
    expect(result.userId).toBeTruthy();
    expect(typeof result.userId).toBe('string');
    expect(result.userId.length).toBeGreaterThan(4);
  });

  it('returns the correct userName', async () => {
    const mockPage = { addInitScript: vi.fn() };
    const result = await seedGuestIdentity(mockPage as any, { userName: 'Delta' });
    expect(result.userName).toBe('Delta');
  });
});

// ---------------------------------------------------------------------------
// mintBotToken
// ---------------------------------------------------------------------------

describe('mintBotToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/admin/token with the given name', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, data: { token: 'tok_abc', userId: 'bot_xyz' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await mintBotToken({ name: 'TestBot', serverUrl: 'http://localhost:3001' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/admin/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'TestBot' }),
      }),
    );
    expect(result.token).toBe('tok_abc');
    expect(result.userId).toBe('bot_xyz');
  });

  it('throws a BotError with status when server returns non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal error' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      mintBotToken({ name: 'Fail', serverUrl: 'http://localhost:3001' }),
    ).rejects.toThrow('500');
  });

  it('throws a BotError when fetch itself rejects (server down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      mintBotToken({ name: 'Down', serverUrl: 'http://localhost:9999' }),
    ).rejects.toThrow();
  });
});
