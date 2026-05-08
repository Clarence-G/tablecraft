/**
 * Ergonomic builders for Activity Log notifications.
 *
 * Use these helpers in `logic.ts` instead of hand-authoring `NOTIFY_ALL`
 * engine events — they make forgetting required fields a compile error
 * and keep the call site down to a single line.
 *
 * Example:
 *
 * ```ts
 * import { logAction, logSystem } from '@repo/shared';
 *
 * events: [
 *   logAction(playerID, 'log.move', { row: 7, col: 7 }),
 *   logSystem('log.win', { actorId: playerID }),
 *   { type: 'END_GAME', rankings: [playerID, loser] },
 * ]
 * ```
 *
 * For **game-specific UI side-channel** notifications (e.g. Love Letter's
 * Baron telling one player what card their opponent held), keep using
 * raw `NOTIFY` events with your own payload shape — just make sure those
 * payloads DO NOT have `channel: 'log'`, or they'll get ingested into
 * the ActivityLog.
 */
import type { LogNotificationPayload } from '../types/notification';

/**
 * The NOTIFY_ALL variant returned by `logAction` / `logSystem`, with the
 * payload narrowed to `LogNotificationPayload`. Use this instead of
 * `Extract<EngineEvent, { type: 'NOTIFY_ALL' }>` when you need static
 * access to `ev.payload.messageParams` etc.
 */
export type LogNotifyAllEvent = {
  type: 'NOTIFY_ALL';
  payload: LogNotificationPayload;
};

/**
 * The NOTIFY variant returned by `logPrivate`, payload narrowed.
 */
export type LogNotifyEvent = {
  type: 'NOTIFY';
  to: string;
  payload: LogNotificationPayload;
};

/**
 * Build a `NOTIFY_ALL` engine event for a player action log entry.
 * Every player in the room sees the entry attributed to `actorId`.
 *
 * @param actorId     Player UUID who performed the action
 * @param messageKey  i18n key under the game's namespace (e.g. "log.move")
 * @param messageParams  Optional interpolation values (row, col, amount…)
 */
export function logAction(
  actorId: string,
  messageKey: string,
  messageParams?: Record<string, string | number | boolean>,
): LogNotifyAllEvent {
  const payload: LogNotificationPayload = {
    channel: 'log',
    messageKey,
    actorId,
    kind: 'action',
  };
  if (messageParams) payload.messageParams = messageParams;
  return { type: 'NOTIFY_ALL', payload };
}

/**
 * Build a `NOTIFY_ALL` engine event for a neutral system log entry
 * (round started, timer expired, match ended, etc.). Pass `actorId`
 * when a specific player caused the event; omit for impersonal events.
 *
 * Two call shapes are supported for ergonomics, because in practice
 * authors reach for both:
 *
 *   logSystem('log.roundStart', { round: 2 })                   // flat params
 *   logSystem('log.win', { actorId: winnerID })                 // options
 *   logSystem('log.turnEnd', { messageParams: { team: 'red' } }) // explicit
 *
 * The flat shape is detected when the object has NEITHER `actorId` NOR
 * `messageParams` keys. If both styles are present (e.g. you pass
 * `{ actorId: 'x', round: 2 }`), the options shape wins and `round`
 * is ignored — so put params under `messageParams` when mixing.
 *
 * @param messageKey  i18n key under the game's namespace
 * @param opts        Either flat `messageParams` or `{ actorId?, messageParams? }`
 */
export function logSystem(
  messageKey: string,
  opts?:
    | Record<string, string | number | boolean>
    | {
        actorId?: string;
        messageParams?: Record<string, string | number | boolean>;
      },
): LogNotifyAllEvent {
  const payload: LogNotificationPayload = {
    channel: 'log',
    messageKey,
    kind: 'system',
  };
  if (opts) {
    const maybeOptions = opts as {
      actorId?: unknown;
      messageParams?: unknown;
    };
    const hasOptionsShape =
      typeof maybeOptions.actorId === 'string' ||
      (typeof maybeOptions.messageParams === 'object' && maybeOptions.messageParams !== null);
    if (hasOptionsShape) {
      if (typeof maybeOptions.actorId === 'string') payload.actorId = maybeOptions.actorId;
      if (maybeOptions.messageParams && typeof maybeOptions.messageParams === 'object') {
        payload.messageParams = maybeOptions.messageParams as Record<
          string,
          string | number | boolean
        >;
      }
    } else {
      // Treat the whole object as flat messageParams.
      const flat = opts as Record<string, string | number | boolean>;
      if (Object.keys(flat).length > 0) payload.messageParams = flat;
    }
  }
  return { type: 'NOTIFY_ALL', payload };
}

/**
 * Build a targeted private log entry — only `to` sees it in their
 * ActivityLog. Use only for truly private events (e.g. "you were dealt
 * a 5"). For public events, prefer {@link logAction} / {@link logSystem}.
 */
export function logPrivate(
  to: string,
  messageKey: string,
  opts: {
    actorId?: string;
    messageParams?: Record<string, string | number | boolean>;
    kind?: LogNotificationPayload['kind'];
  } = {},
): LogNotifyEvent {
  const payload: LogNotificationPayload = {
    channel: 'log',
    messageKey,
    kind: opts.kind ?? 'info',
  };
  if (opts.actorId) payload.actorId = opts.actorId;
  if (opts.messageParams) payload.messageParams = opts.messageParams;
  return { type: 'NOTIFY', to, payload };
}
