# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# PARALLEL ROLLOUT NOTICE
You are running in parallel with sibling CC workers on other features. Other files in the working tree may be modified by them — this is EXPECTED, not a corruption. Do NOT `git stash`, `git reset`, `git checkout`, or otherwise discard untracked/unstaged changes. If `pnpm typecheck` fails on a file you didn't touch, read it and adapt.

---

# TASK: CLI chat — let bot agents send/receive in-room messages

TableCraft already has browser-side chat (socket event `chat:send` → `chat:message` broadcast, in-memory `chatHistory` on GameRoom, `ChatMessage` type). Agents using the `tablecraft` CLI currently cannot participate — the CLI is REST-only and has no chat command. Your job: add a REST chat API + a `tablecraft game chat` CLI subcommand so bots can banter too.

## Project path
`/Users/bytedance/Projects/tablecraft`

## Background — READ FIRST

1. `packages/server/src/socket/handlers.ts` lines ~248-285 — existing socket chat handler. Understand the `ChatMessage` shape, `chatRateLimit`, `room.appendChatMessage`, `io.to(room.roomId).emit('chat:message', msg)` broadcast pattern.
2. `packages/shared/src/types/chat.ts` (or wherever `ChatMessage` is defined — grep for it). Understand its fields.
3. `packages/server/src/GameRoom.ts` — find `appendChatMessage`, `chatHistory`, and any `chatSeq` tracking. If there's no `chatSeq`, you may need to add one.
4. `packages/server/src/api/router.ts` — existing REST route patterns. You'll add 2 new endpoints here.
5. `packages/cli/src/commands/game.ts` — existing `gameStateCommand`, `gameActionCommand`, `gameWaitCommand`. You'll add `gameChatCommand` in the same style.
6. `packages/cli/src/index.ts` — the command dispatcher. Register your new subcommand here.
7. `skill_data/tablecraft-player/SKILL.md` — the shipped-to-agents doc. **ALREADY documents the expected CLI commands — go look.** Your CLI implementation MUST match the documented command surface exactly. The relevant commands:
   - `tablecraft game chat <roomId> "<text>"` — send
   - `tablecraft game chat <roomId> --tail <N>` — read last N
   - `tablecraft game chat <roomId> --after <ms-timestamp>` — long-poll for new messages since

## What to build

### A. Server — 2 new REST endpoints

In `packages/server/src/api/router.ts`:

#### `POST /api/rooms/:id/chat`
- Auth required (use the same `auth` middleware the other room-mutation routes use).
- Body: `{ text: string }`.
- Behavior: mirror the socket `chat:send` handler EXACTLY:
  - Trim + slice to 500 chars. Reject empty strings.
  - Rate-limit: reuse or duplicate the per-user token-bucket from the socket handler (5 tokens, refill 1/sec, enforced per `userId`). Share the limiter state between socket and REST so a bot spamming via CLI gets throttled just as a browser would — do this by moving the limiter into a module-scope map keyed by `userId` in `packages/server/src/socket/handlers.ts` and exporting a helper `tryConsumeChatToken(userId: string): boolean`. Both the socket handler AND the REST handler call this helper.
  - Build the `ChatMessage` (same shape; use `crypto.randomUUID()` for id if that's the existing pattern).
  - `room.appendChatMessage(msg)`.
  - Broadcast on socket: `io.to(room.roomId).emit('chat:message', msg)` — use the same `io` instance that Pitfall #17 broadcast-parity fix taught us to pass to the router (if the router already receives `io`, use it; if not, this is the fix).
  - Respond `{ ok: true, data: msg }`.

#### `GET /api/rooms/:id/chat`
- Auth required.
- Query params:
  - `?tail=<N>` — return the last N messages (capped at 200). Default 50.
  - `?after=<ms>` — long-poll: block up to 30s waiting for messages newer than `after` timestamp. Return as soon as any arrive. Similar pattern to `GET /api/rooms/:id/wait` — reuse its waiter mechanism if possible (find how `wait` is implemented in GameRoom).
- Response: `{ ok: true, data: { messages: ChatMessage[], lastAt: number } }`.
- If `after` is given and 30s pass with no new messages, return `{ ok: true, data: { messages: [], lastAt: <after> } }` so CLI can decide to long-poll again.

If adding `after`-based long-poll is non-trivial (no existing waiter machinery for chat), **do a simpler approach**: always return the filtered history (messages with `at > after`) immediately, no blocking. CLI will poll in a tight-ish loop. Document the simplification in the ISSUE doc. Agents can sleep 2-5s between polls.

### B. CLI — new `game chat` subcommand

In `packages/cli/src/commands/game.ts`, add `gameChatCommand`:

```ts
export async function gameChatCommand(client: ApiClient, args: string[]): Promise<unknown> {
  const roomId = args[0];
  if (!roomId) {
    return { ok: false, error: 'MISSING_ARGS', message: 'Usage: tablecraft game chat <roomId> [message | --tail N | --after <ms>]', hint: '' };
  }

  // Parse flags
  let tail: number | undefined;
  let after: string | undefined;
  let text: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--tail' && args[i + 1]) tail = Number(args[++i]);
    else if (args[i] === '--after' && args[i + 1]) after = args[++i];
    else if (!args[i].startsWith('--') && text === undefined) text = args[i];
  }

  // Send
  if (text !== undefined) {
    return client.post(`/rooms/${encodeURIComponent(roomId)}/chat`, { text });
  }

  // Read
  const qs = new URLSearchParams();
  if (tail !== undefined) qs.set('tail', String(tail));
  if (after !== undefined) qs.set('after', after);
  const q = qs.toString() ? `?${qs}` : '';
  return client.get(`/rooms/${encodeURIComponent(roomId)}/chat${q}`);
}
```

Register it in `packages/cli/src/index.ts` under the `game` subcommand, following the same pattern as `state | action | wait`.

### C. Unit tests

Add tests to `packages/server/**` (find where existing router tests live — likely `packages/server/src/api/router.test.ts` or similar):
- `POST /chat` happy path — auth'd user, valid text, returns message, broadcasts on socket.
- `POST /chat` rate-limit: 6th send within a second returns 429 or `{ok:false,error:'RATE_LIMITED'}` (match whatever error code existing code uses).
- `POST /chat` empty text → 400 / `INVALID_INPUT`.
- `POST /chat` not-in-room → 403 / `NOT_A_PLAYER`.
- `GET /chat?tail=5` returns last 5 in order.
- `GET /chat?after=<ts>` returns only newer messages.

Add test for CLI command in `packages/cli/**` tests if CLI tests exist (grep for existing CLI tests; skip if there's no existing CLI test harness).

## Scope fence (files you may touch)
- `packages/server/src/api/router.ts`
- `packages/server/src/socket/handlers.ts` — factor out `tryConsumeChatToken`
- `packages/server/src/GameRoom.ts` — only if chat-waiter machinery needs to be added
- `packages/server/**/*.test.ts` — add tests
- `packages/cli/src/commands/game.ts`
- `packages/cli/src/index.ts`
- `packages/cli/README.md` — brief command reference update
- **DO NOT touch `skill_data/tablecraft-player/SKILL.md`** — orchestrator already wrote it. Your job is to make the CLI match the doc, not change the doc.

**Do NOT** touch:
- `packages/client/**`, `packages/game-ui/**`, `games/**` — unrelated to this task.

## TableCraft iron rules
1. **i18n strict** on any new client-side strings (there aren't any for this task — CLI-only).
2. **REST↔socket broadcast parity (Pitfall #17)**: your new `POST /chat` MUST call `io.to(room.roomId).emit('chat:message', msg)` so browser chat sees bot messages in real time. Verify the router already receives `io`; if not, thread it through (check `packages/server/src/index.ts` for `createApiRouter(...)` call signature).
3. **No commit, no push.** Orchestrator commits.
4. **Typecheck is truth**: trust `pnpm typecheck` end-to-end.
5. **Publish the CLI? NO.** Do NOT run `pnpm publish` or bump the CLI version. The orchestrator handles that after all changes are reviewed.

## Validation
```bash
cd /Users/bytedance/Projects/tablecraft
pnpm typecheck
pnpm --filter @repo/server test
pnpm --filter tablecraft-cli test 2>/dev/null || true  # skip if no CLI tests
# Smoke test (server must be running separately, OR spin up a test instance):
# (skip actual server smoke — orchestrator will do that)
```

## Deliverables
1. `packages/server/src/api/router.ts` — 2 new endpoints with auth + rate-limit + broadcast.
2. `packages/server/src/socket/handlers.ts` — extracted shared rate-limiter helper.
3. `packages/server/**/*.test.ts` — 6 new tests, all green.
4. `packages/cli/src/commands/game.ts` — `gameChatCommand`.
5. `packages/cli/src/index.ts` — dispatcher wired.
6. `packages/cli/README.md` — 3 lines added for new command.
7. ISSUE doc at `docs/ISSUE_cli-chat.md` with sections:
   - **API design** (rate-limit sharing, long-poll-or-simple decision)
   - **Changes applied**
   - **Deferred** (e.g. if you skipped the long-poll in favor of simple polling)
   - **Validation output** (typecheck + test counts)

START NOW.
