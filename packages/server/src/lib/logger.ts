import pino from 'pino';

/**
 * Application logger. Pino in production (JSON), pretty in dev.
 *
 * Usage:
 *   import { logger } from './lib/logger';
 *   logger.info({ roomId }, 'room created');
 *   const log = logger.child({ mod: 'socket' });
 *   log.warn({ userId }, 'kicked');
 */
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: { service: 'tablecraft' },
});

export type Logger = typeof logger;
