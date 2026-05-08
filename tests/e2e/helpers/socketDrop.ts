import type { Page } from '@playwright/test';

/**
 * Simulate a socket.io client drop by calling `socket.disconnect()` on the
 * singleton exposed as `window.__socket` by useSocket.ts (dev/test only).
 *
 * Waits until the client reports it is no longer connected, then returns. The
 * server sees this as a normal transport close and runs its disconnect handler
 * (GameRoom.markDisconnected).
 *
 * @throws if `window.__socket` is not available (client build is not dev/test)
 */
export async function dropSocket(page: Page, timeoutMs = 3000): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __socket?: { connected: boolean } }).__socket?.connected === true,
    undefined,
    { timeout: timeoutMs },
  );
  await page.evaluate(() => {
    const s = (window as unknown as { __socket?: { disconnect(): unknown } }).__socket;
    if (!s)
      throw new Error('window.__socket is not exposed — client must be built in dev/test mode');
    s.disconnect();
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __socket?: { connected: boolean } }).__socket?.connected === false,
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * Reconnect after `dropSocket`. Calls `socket.connect()` and waits until the
 * client reports `connected === true`.
 *
 * On successful reconnect, the server's `io.on('connection')` handler runs the
 * auto-rejoin branch: markReconnected, re-emit room:state, re-emit game:state.
 * The client's useSocket / App.tsx also emits `room:resume` on connect.
 */
export async function reconnectSocket(page: Page, timeoutMs = 5000): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as { __socket?: { connect(): unknown } }).__socket;
    if (!s) throw new Error('window.__socket is not exposed');
    s.connect();
  });
  await page.waitForFunction(
    () => (window as unknown as { __socket?: { connected: boolean } }).__socket?.connected === true,
    undefined,
    { timeout: timeoutMs },
  );
}
