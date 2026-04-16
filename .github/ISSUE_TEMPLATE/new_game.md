---
name: New Game
about: Propose or submit a new game plugin
title: "[Game] "
labels: new-game
---

**Game name**
Name of the game.

**Player count**
Min-max players.

**Brief rules**
How the game works in 2-3 sentences.

**Implementation status**
- [ ] `shared.ts` -- metadata and action schema
- [ ] `logic.ts` -- game rules
- [ ] `Board.tsx` -- game UI
- [ ] `logic.test.ts` -- unit tests
- [ ] Registered in both registries
- [ ] All checks pass (`pnpm typecheck && pnpm lint && pnpm test`)
