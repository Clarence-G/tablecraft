/**
 * ActivityLog notification payload contract.
 *
 * Server-side game logic emits NOTIFY / NOTIFY_ALL engine events for two
 * very different reasons:
 *
 *   1. **Activity Log entries** — "Alice placed a stone at (8, 8)". These
 *      show up in the right side panel's log tab. Every game sends these
 *      in the same shape, defined by `LogNotificationPayload` below.
 *
 *   2. **Game-specific UI side-channel** — e.g. Love Letter's Baron telling
 *      one player "you peeked at Bob's card = 5". These are consumed by
 *      the per-game Board component through its `notifications` prop and
 *      have game-specific shapes.
 *
 * The discriminator is the top-level `channel` field:
 *   - `channel: 'log'`   → ingested by GameLogProvider, rendered in SidePanel
 *   - `channel: 'ui'`    → ignored by GameLogProvider, forwarded to Board
 *   - (no channel)       → treated as `channel: 'ui'` for backward compat
 *
 * Authors should almost always use the `logAction` / `logSystem` helpers
 * from `@repo/shared` (see `packages/shared/src/logging/log.ts`) — they
 * build correctly shaped `{ channel: 'log', ... }` payloads for you.
 */
export type LogKind = 'system' | 'action' | 'info';

/**
 * Structured payload for ActivityLog entries. Always has `channel: 'log'`.
 * The client's `GameLogProvider.ingestNotifications` narrows on this.
 */
export interface LogNotificationPayload {
  channel: 'log';
  /** i18n key resolved against the game's namespace (e.g. "log.move"). */
  messageKey: string;
  /** Parameters interpolated into the translated template. */
  messageParams?: Record<string, string | number>;
  /**
   * The player whose action is described. Display names are resolved by
   * the SidePanel from the live player list — never inline names into
   * `messageParams` yourself.
   */
  actorId?: string;
  /** Severity / styling hint. Defaults to 'system' when omitted. */
  kind?: LogKind;
}

/**
 * Type guard for the ActivityLog sub-channel. Use this in client code that
 * multiplexes on the `notifications` array (e.g. GameLogProvider,
 * game-specific Board handlers).
 */
export function isLogNotification(payload: unknown): payload is LogNotificationPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.channel === 'log' && typeof p.messageKey === 'string';
}
