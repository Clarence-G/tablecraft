import type { Page } from '@playwright/test';

/** The localStorage key used by useIdentity to persist guest identity. */
export const IDENTITY_KEY = 'tabletop:identity';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/**
 * Seeds a guest identity via the correct 'tabletop:identity' localStorage key.
 *
 * Pattern A — addInitScript BEFORE goto (recommended):
 *   const identity = await seedGuestIdentity(page, { userName: 'Alice' });
 *   await page.goto('/');
 *
 *   This is preferred because addInitScript fires before any page JavaScript
 *   runs, so useIdentity reads the seeded value on first render and never
 *   generates a random identity. Prevents a race condition where React mounts
 *   before the script runs.
 *
 * Pattern B — page.evaluate AFTER goto (fallback):
 *   await page.goto('/');
 *   await page.evaluate(({ k, v }) => localStorage.setItem(k, v), {
 *     k: IDENTITY_KEY, v: JSON.stringify({ userId: 'foo', userName: 'Bar' }),
 *   });
 *   await page.reload();
 *
 *   Only use this pattern if you cannot call seedGuestIdentity before goto
 *   (e.g. the page already has other addInitScripts with conflicting setup).
 *   Requires a reload for useIdentity to pick up the change.
 *
 * Calling this twice on the same page is safe: addInitScript functions run in
 * registration order, and both run a setItem on the same key, so the last
 * registered call wins. Callers should avoid double-seeding to keep intent clear.
 *
 * @param page - Playwright page (must not have navigated yet for Pattern A)
 * @param opts.userId - Optional deterministic userId (useful for reconnect tests)
 * @param opts.userName - Display name for the guest
 * @returns The resolved identity (userId is generated if not provided)
 */
export async function seedGuestIdentity(
  page: Page,
  opts: { userId?: string; userName: string },
): Promise<{ userId: string; userName: string }> {
  const userId = opts.userId ?? randomId();
  const identity = { userId, userName: opts.userName };

  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: IDENTITY_KEY, value: JSON.stringify(identity) },
  );

  return identity;
}
