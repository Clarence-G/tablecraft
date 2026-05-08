import * as Sentry from '@sentry/node';
import { logger } from './logger';

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info({ mod: 'sentry' }, 'no SENTRY_DSN — error tracking disabled');
    return false;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RELEASE_SHA,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    integrations: [new Sentry.Integrations.Http(), new Sentry.Integrations.Express()],
  });
  initialized = true;
  logger.info({ mod: 'sentry' }, 'sentry initialized');
  return true;
}

export { Sentry };
