import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
  if (!apiKey) {
    console.log('[analytics] no VITE_POSTHOG_KEY — disabled');
    return;
  }
  posthog.init(apiKey, {
    api_host: host,
    capture_pageview: true,
    autocapture: false,
  });
  initialized = true;
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.warn('[analytics] track failed', err);
  }
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.identify(userId, traits);
}
