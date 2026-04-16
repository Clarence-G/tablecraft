# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Project-Specific Rules

- **No emoji in code or docs.** Use lucide-react icons for UI, plain text for logs and documentation.
- **Must support PC and mobile.** All pages and game boards must be tested at 375px width.
- **Use Design Tokens.** Never hardcode colors (e.g. `bg-gray-800`). Use token classes (`bg-card`, `text-muted-foreground`).
- **Reuse before building.** Check `@repo/game-ui` and `shadcn/ui` for existing components before creating new ones.
- **Follow DESIGN.md.** The UI is warm skeuomorphic (cream background, thick brown borders, hard offset shadows). See `docs/DESIGN.md` for full spec.
- **Include rules for agents.** New games must include `rules` (human-readable) and `agentRules` (machine-readable action/view schema) in the `meta` export. See `games/gomoku/shared.ts` for reference.

## 6. Adding a New Game — Quick Reference

**Do NOT explore the engine layer.** The plugin contract is fixed. Read `games/_template/` and one existing game (e.g. `games/gomoku/`) as reference, then implement directly.

### Files to create (`games/<game-id>/`)

| File | What to do |
|------|-----------|
| `shared.ts` | Export `meta: GameMeta` (id, name, description, minPlayers, maxPlayers, tags, icon, estimatedMinutes, rules, agentRules), `ActionSchema` (Zod), `Action` type, `PlayerView` interface |
| `logic.ts` | Implement `GameLogic<TState, Action, PlayerView>` — `setup`, `onAction`, `getPlayerView`, optional `getSpectatorView`/`onTimer`/`onPlayerDisconnect` |
| `Board.tsx` | React component: `export function Board(props: BoardProps<PlayerView, Action>)` |
| `logic.test.ts` | Tests using `GameTestHarness` from `@repo/shared/testing` |
| `package.json` | Copy from `_template`, change `name` to `@games/<game-id>` |
| `vitest.config.ts` | Copy from `_template`, change test `name` |

### Files to modify (registration)

```
games/server-registry.ts          — import & add to serverRegistry
games/client-registry.ts          — import meta + lazy(() => import board)
packages/client/vite.config.ts    — add @games/<id>/shared alias
packages/client/tsconfig.json     — add paths for shared + board
vitest.workspace.ts               — add vitest config path
package.json (root)               — add @games/<id>: workspace:*
```

### Key interfaces (don't read engine source, just use these)

- `GameLogic<TState, TAction, TView>` — server game rules (`@repo/shared`)
- `BoardProps<TView, TAction>` — React Board props: `{ state, myId, players, sendAction, lastReject, notifications, onReturnToRoom?, onReturnToLobby? }`
- `GameContext` — `{ players: string[], random: SeededRandom }` passed to `setup`/`onAction`
- `ActionResult<S>` — return `{ ok: true, state, events? }` or `{ ok: false, reason }`
- `EngineEvent` — `SET_TIMER` | `CLEAR_TIMER` | `NOTIFY` | `NOTIFY_ALL` | `END_GAME`
- Hidden info: `getPlayerView(state, playerID)` filters per player. Never send full state.

### Reusable UI components

- `PlayerBadge` — `@repo/game-ui/player`
- `GameOverModal` — `@repo/game-ui/feedback`
- `Button`, `Badge`, `Card`, `Dialog` — `@/components/ui/*` (shadcn)

### Workflow

1. Copy `_template` to `games/<id>/`, update `package.json` name
2. Implement `shared.ts` → `logic.ts` → `logic.test.ts` → `Board.tsx`
3. Register (6 files above)
4. `pnpm install && pnpm test && pnpm typecheck`
5. `pnpm dev` — verify in browser

## 7. Agent & Bot System

The platform supports AI agent access via REST API and CLI.

- **REST API** at `/api/*` — 12 endpoints for game discovery, room management, and gameplay. See `packages/server/src/api/router.ts`.
- **CLI** (`tablecraft`) at `packages/cli/` — thin HTTP client, all output is single-line JSON. Run via `tsx packages/cli/src/index.ts <command>`.
- **Skill** at `.claude/skills/tablecraft-player/` — teaches Claude Code agents how to use the CLI.
- **Bot tokens** — generated via `POST /api/admin/token`, stored in memory. Bots auto-ready on room join.
- **Game rules for agents** — each game's `meta.agentRules` provides machine-readable action format and view schema.

New games automatically work with the CLI/API — no CLI changes needed. Just populate `agentRules` in the game's `shared.ts`.