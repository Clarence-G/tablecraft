# ISSUE: cli-chat — bot agents can now send and receive in-room chat messages

## API design

### Rate-limit sharing

The existing socket `chat:send` handler had a per-socket token bucket (`chatRateLimit`) living inside the socket closure. To enforce a single rate limit across both the socket and REST paths for the same user, the bucket was moved to a module-scope `Map<string, { last: number; tokens: number }>` in `socket/handlers.ts` and exposed as an exported helper `tryConsumeChatToken(userId)`. Both the socket handler and the new REST endpoint call this helper — a user spamming via the CLI gets throttled on exactly the same counter as a user spamming in the browser.

### Long-poll decision

The task offers two options for `GET /rooms/:id/chat?after=<ms>`:
- (A) True 30-second long-poll blocking until new messages arrive
- (B) Immediate return of filtered history, with the client polling in a loop

Option (B) was chosen because the `GameRoom` waiter machinery (`waiters` array in `waitForChange`) is keyed on game-state sequence number, not on chat messages. Wiring up a separate chat-waiter list in `GameRoom` would require touching the engine layer and adding state (see Deferred section). The simpler approach is sufficient for bot use cases: agents calling `game chat <roomId> --after <lastAt>` in a 2-5s loop get new messages within the next poll cycle.

## Changes applied

| File | Change |
|------|--------|
| `packages/server/src/socket/handlers.ts` | Moved per-socket rate limiter to module-scope `chatBuckets` Map; exported `tryConsumeChatToken(userId)` |
| `packages/server/src/api/router.ts` | Added `POST /rooms/:id/chat` (send) and `GET /rooms/:id/chat` (read) with auth, rate-limit, moderation, and socket broadcast |
| `packages/server/src/api/chat.test.ts` | 6 new tests: happy path, rate-limit, empty text, not-a-player, tail query, after query |
| `packages/cli/src/commands/game.ts` | Added `gameChatCommand` (send / --tail / --after) |
| `packages/cli/src/index.ts` | Registered `game chat` subcommand in dispatcher and USAGE string |
| `packages/cli/README.md` | Added 3 rows to the Commands table |

## Deferred

- **True long-poll for `GET /rooms/:id/chat?after=<ms>`**: currently returns immediately. To implement blocking, `GameRoom` would need a `chatWaiters` array (mirroring `waiters` for game-state) and `appendChatMessage` would need to wake them. Deferred because the added complexity is not necessary for bot use cases, and polling at 2-5s intervals is fully adequate.

## Validation output

```
pnpm typecheck           → 0 errors (shared + game-ui + client)
tsc --noEmit (server)    → 0 errors
tsc --noEmit (cli)       → 0 errors
pnpm --filter @repo/server test → 128 passed (15 test files), including 6 new chat tests
```
