import { PostHog } from 'posthog-node';
import { logger } from './logger';

type NoOpClient = {
  capture: (event: Parameters<PostHog['capture']>[0]) => void;
  shutdown: () => Promise<void>;
};

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

let client: PostHog | NoOpClient;

if (apiKey) {
  client = new PostHog(apiKey, { host, flushAt: 20, flushInterval: 10_000 });
  logger.info({ host, mod: 'analytics' }, 'posthog initialized');
} else {
  client = {
    capture: () => {},
    shutdown: async () => {},
  };
  logger.info({ mod: 'analytics' }, 'no POSTHOG_API_KEY — analytics disabled');
}

export function track(userId: string, event: string, properties?: Record<string, unknown>) {
  try {
    client.capture({ distinctId: userId, event, properties });
  } catch (err) {
    logger.warn({ err, event, mod: 'analytics' }, 'track failed');
  }
}

export async function flushAnalytics() {
  await client.shutdown();
}
