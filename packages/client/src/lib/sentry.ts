import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] no VITE_SENTRY_DSN — error tracking disabled');
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE_SHA,
    tracesSampleRate: 0.1,
    integrations: [new Sentry.BrowserTracing()],
  });
}

export { Sentry };
