# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# STAGE 2-E: Observability — Sentry + PostHog (server + client)

You are the **observability worker**. You wire Sentry for error tracking and PostHog for product analytics, both on server and client, both gracefully degrading when no DSN/key is configured.

## Context

Stage 1 has added pino logger at `packages/server/src/lib/logger.ts` and helmet/rate-limit in `packages/server/src/index.ts`. USE the logger.

## Read FIRST

1. `CLAUDE.md`
2. `packages/server/src/index.ts` — server bootstrap (helmet already added by Stage 1)
3. `packages/client/src/main.tsx` — client bootstrap
4. `.env.example` — env convention (Stage 2-C may also touch this)
5. Sentry SDK refs:
   - Node: `@sentry/node` — `Sentry.init({ dsn, ... })`, `Sentry.Handlers.requestHandler()`, `Sentry.Handlers.errorHandler()`
   - React: `@sentry/react` — `Sentry.init({ dsn, integrations: [new BrowserTracing()], ... })`
6. PostHog SDKs:
   - Node: `posthog-node` — `new PostHog(apiKey, { host })`
   - React: `posthog-js` — `posthog.init(apiKey, { api_host })`

## What to build

### A. Install deps

```bash
cd /Users/bytedance/Projects/boardgames
pnpm --filter @repo/server add @sentry/node posthog-node
pnpm --filter @tablecraft/client add @sentry/react posthog-js
```

(Check client package name from `packages/client/package.json`; if it's `@repo/client`, adjust.)

### B. Server-side Sentry wrapper at `packages/server/src/lib/sentry.ts`

```ts
import * as Sentry from '@sentry/node';
import { logger } from './logger';

let initialized = false;

/**
 * Initialize Sentry if SENTRY_DSN is set. Idempotent, safe to call from
 * multiple entry points. When no DSN, everything is a no-op so the rest
 * of the code can call captureException without guards.
 */
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
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
  initialized = true;
  logger.info({ mod: 'sentry' }, 'sentry initialized');
  return true;
}

export { Sentry };
```

### C. Server-side PostHog at `packages/server/src/lib/analytics.ts`

```ts
import { PostHog } from 'posthog-node';
import { logger } from './logger';

type NoOpPostHog = {
  capture: (event: any) => void;
  identify: (params: any) => void;
  shutdown: () => Promise<void>;
};

let client: PostHog | NoOpPostHog;

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

if (apiKey) {
  client = new PostHog(apiKey, { host, flushAt: 20, flushInterval: 10_000 });
  logger.info({ host, mod: 'analytics' }, 'posthog initialized');
} else {
  client = {
    capture: () => {},
    identify: () => {},
    shutdown: async () => {},
  };
  logger.info({ mod: 'analytics' }, 'no POSTHOG_API_KEY — analytics disabled');
}

/**
 * Fire-and-forget event capture. Never throws.
 */
export function track(userId: string, event: string, properties?: Record<string, any>) {
  try {
    client.capture({ distinctId: userId, event, properties });
  } catch (err) {
    logger.warn({ err, event, mod: 'analytics' }, 'track failed');
  }
}

export async function flushAnalytics() {
  await client.shutdown();
}
```

### D. Wire into `packages/server/src/index.ts`

Add at the VERY TOP (before any other imports — Sentry doc requires this for auto-instrumentation):
```ts
import { initSentry, Sentry } from './lib/sentry';
initSentry();
```

Then, AFTER `app = express()` and helmet/cors/rate-limit (Stage 1's work), add Sentry request handler BEFORE any routes:
```ts
app.use(Sentry.Handlers.requestHandler());
```

AFTER all routes, add Sentry error handler BEFORE any other error middleware:
```ts
app.use(Sentry.Handlers.errorHandler());
```

On SIGTERM/SIGINT shutdown, add `await flushAnalytics()` before the final process.exit.

Note: if `Sentry.Handlers.requestHandler` doesn't exist in v8+ of @sentry/node, use `Sentry.setupExpressErrorHandler(app)` pattern instead. Check installed version.

### E. Client-side Sentry at `packages/client/src/lib/sentry.ts`

```ts
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
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export { Sentry };
```

### F. Client-side PostHog at `packages/client/src/lib/analytics.ts`

```ts
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
    autocapture: false,  // we're explicit about events
  });
  initialized = true;
}

export function track(event: string, properties?: Record<string, any>) {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.warn('[analytics] track failed', err);
  }
}

export function identify(userId: string, traits?: Record<string, any>) {
  if (!initialized) return;
  posthog.identify(userId, traits);
}
```

### G. Wire into `packages/client/src/main.tsx`

At the VERY TOP of main.tsx:
```ts
import { initSentry } from './lib/sentry';
import { initAnalytics } from './lib/analytics';
initSentry();
initAnalytics();
```

### H. Add a React error boundary

Wrap the app root in `Sentry.ErrorBoundary`. Look at `main.tsx` or `App.tsx`:

```tsx
import { Sentry } from './lib/sentry';

<Sentry.ErrorBoundary fallback={<div>Something went wrong</div>}>
  <App />
</Sentry.ErrorBoundary>
```

(Use i18n for the fallback text — add a key `errors.somethingWrong`.)

### I. .env.example

Add (preserve existing contents, append):
```
# Sentry — optional. Unset = no error tracking. Get a DSN at https://sentry.io
SENTRY_DSN=
VITE_SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1

# PostHog — optional. Unset = no analytics.
POSTHOG_API_KEY=
POSTHOG_HOST=https://app.posthog.com
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=

# Release tracking (CI sets this).
RELEASE_SHA=
VITE_RELEASE_SHA=
```

### J. A couple of example `track()` calls (for sanity)

In server: emit an analytics event on room create. Find `room:create` socket handler — DO NOT edit the main socket flow; just add ONE line:
```ts
// inside room:create ack path, after success:
track(socket.data.userId, 'room_created', { gameId: room.gameId, roomId: room.roomId });
```

NOTE: Stage 2-B is editing `socket/handlers.ts`. Your change is strictly one-line additive. Check git status first; if you see a conflict, record in ISSUE doc and put the track() call in a helper function imported by handlers.ts — let Stage 2-B integrate later.

In client: emit `game_joined` on successful room join. In `pages/Lobby.tsx` or wherever join logic is:
```ts
import { track } from '@/lib/analytics';
// after successful join:
track('game_joined', { gameId });
```

### K. Tests

1. `packages/server/src/lib/sentry.test.ts`:
   - `initSentry()` with no DSN → returns false, doesn't throw
   - `initSentry()` idempotent (two calls = one init)

2. `packages/server/src/lib/analytics.test.ts`:
   - `track()` with no API key → no-op, doesn't throw
   - `flushAnalytics()` resolves cleanly with no API key

Target: ≥4 new assertions.

## Hard constraints

1. **DO NOT edit**:
   - `packages/server/src/db/schema.ts` (Stage 1)
   - `packages/server/src/engine/**` (Stage 2-B)
   - `packages/server/src/lib/auth.ts`, `lib/email.ts` (Stage 2-C)
   - `packages/server/src/lib/moderation.ts`, `api/reports.ts` (Stage 2-D)
   - `packages/server/src/lib/logger.ts` (Stage 1)
   - `packages/server/src/socket/handlers.ts` beyond the ONE-LINE track() addition (see §J; skip if conflict)

2. **DO create**:
   - `packages/server/src/lib/sentry.ts`
   - `packages/server/src/lib/analytics.ts`
   - `packages/client/src/lib/sentry.ts`
   - `packages/client/src/lib/analytics.ts`

3. **DO edit**:
   - `packages/server/src/index.ts` (Sentry init + handlers + flush on shutdown)
   - `packages/client/src/main.tsx` (init calls + ErrorBoundary)
   - `.env.example`
   - `packages/server/package.json` + `packages/client/package.json` (via pnpm add)
   - One place each for example `track()` call (fire-and-forget)

4. **Graceful degradation**: Server must boot fine with NO Sentry/PostHog env. Test by running without any env set. Log at info level that tracking is off. Do NOT crash, do NOT print warnings in red.

5. **No emoji** (CLAUDE.md).

## Validation

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test
pnpm test
```

Manual:
1. Start server with no Sentry/PostHog env — log should say "tracking disabled"
2. Hit health endpoint — no errors
3. (If you have a free Sentry DSN you can test end-to-end — not required)

## Deliverables

1. Server sentry.ts + analytics.ts with graceful no-op
2. Client sentry.ts + analytics.ts with graceful no-op
3. Init calls wired in `server/index.ts` and `client/main.tsx`
4. ErrorBoundary wraps app
5. One example server `track()` + one example client `track()` call
6. .env.example updated
7. Tests green (≥4 new assertions)
8. Server boots with no DSN/key set — validated
9. `docs/ISSUE_stage2-observability.md`

## Out of scope (record, don't do)

- Custom Sentry context (user ID binding) — nice-to-have, can add later
- PostHog feature flags
- Dashboard/funnel configuration
- Replay / session recording
- Tracing span customization beyond defaults
- Sourcemap uploads (CI concern)

START NOW.
