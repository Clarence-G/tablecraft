# Stage 1 Foundation — Issue Log

## 1. Summary

Stage 1 is complete. All deliverables shipped: 4 new DB tables, migration, pino logger, helmet + rate-limit middleware, logger wired into server lifecycle.

## 2. Deliverables

| Item | Status | Notes |
|------|--------|-------|
| 4 new tables in `schema.ts` | Done | Appended, no existing tables touched |
| `drizzle/0004_yummy_pretty_boy.sql` | Done | Only CREATE TABLE/INDEX, no drops/alters |
| `packages/server/src/lib/logger.ts` | Done | Pino, pretty in dev, JSON in prod |
| `index.ts` — helmet + rate-limit | Done | After cors, `/api` rate-limited at 300/min |
| `index.ts` — logger wired | Done | All lifecycle console.log replaced |
| `pnpm typecheck` | Green | |
| `pnpm test` | 440/440 pass | 13 pre-existing jsdom/Node ESM errors (see §6) |

## 3. Decisions

- **`express-rate-limit` skip path** — `skip: (req) => req.path === '/api/health'` matches the path as seen by the rate-limit middleware (after the `/api` prefix strip). If Express changes how `req.path` is populated for sub-routers, this condition may not fire. Alternative: use `req.originalUrl`.
- **CSP disabled** — `helmet({ contentSecurityPolicy: false })` because SPA assets and Vite dev server don't conform to strict CSP. TODO: tighten once client-side asset fingerprinting is locked in.
- **Logger base tag** — `base: { service: 'tablecraft' }` on every log line. Downstream workers can do `logger.child({ mod: 'socket' })` to add per-subsystem tags without changing this module.

## 4. Out of scope (not done by Stage 1)

- Migrating `console.log` calls in engine/socket layers — downstream workers' choice.
- Adding logger to `GameRoom.ts`, `RoomManager.ts`, `handlers.ts` — out of scope per spec.
- Per-route rate-limit customization (e.g., stricter on `/api/auth`).
- CSP policy tuning.
- Sentry/PostHog integration (Stage 2 observability worker).

## 5. Bugs found outside scope

None found in touched files. The `tablecraft` bin warning (`ENOENT: packages/cli/dist/index.js`) appears on every pnpm install and is pre-existing — CLI isn't built yet.

## 6. Pre-existing test failures (not caused by Stage 1)

`pnpm test` reports 13 unhandled errors from `html-encoding-sniffer@6.0.0` requiring an ES Module (`@exodus/bytes/encoding-lite.js`) via `require()`. This is a transitive dependency of `jsdom@29.0.2`, which requires Node `^20.19.0 || ^22.13.0 || >=24.0.0` but the environment runs Node 20.11.0. The errors existed before Stage 1 changes (verified via `git stash` and re-run). All 27 test files and 440 tests pass regardless.

Recommendation: upgrade Node to 20.19+ or 22.x to resolve.
