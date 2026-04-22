/**
 * Thin REST client. All calls send the BetterAuth session cookie
 * (`credentials: 'include'`) and unwrap the `{ ok, data }` / `{ ok, error }`
 * envelope. Throws `ApiError` with `{ code, message, status }` on failure so
 * callers can branch on `err.code` (e.g. `ALREADY_CLAIMED`).
 */

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${baseURL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  let body: Envelope<T>;
  try {
    body = (await resp.json()) as Envelope<T>;
  } catch {
    throw new ApiError('NETWORK_ERROR', `Non-JSON response: ${resp.status}`, resp.status);
  }

  if (!body.ok) {
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Request failed',
      resp.status,
    );
  }
  return body.data;
}

/**
 * Fire-and-forget guest→user merge. Called once after sign-up/sign-in so the
 * guest's ledger rows roll into the new account. Swallows 409 (already
 * merged, or guestId taken by another user) because the call is idempotent
 * from the caller's perspective — the UI has already navigated forward.
 */
export async function claimGuest(guestId: string): Promise<void> {
  try {
    const data = await apiFetch<{ mergedRows: number }>('/api/me/claim-guest', {
      method: 'POST',
      body: JSON.stringify({ guestId }),
    });
    console.info(`[claim-guest] merged ${data.mergedRows} rows for ${guestId}`);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'ALREADY_CLAIMED' || err.code === 'GUEST_ALREADY_CLAIMED')
    ) {
      console.info(`[claim-guest] skipped (${err.code})`);
      return;
    }
    console.info('[claim-guest] failed', err);
  }
}
