# Contributing to TableCraft

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/Clarence-G/tablecraft.git
cd tablecraft
pnpm install
pnpm dev
```

Requires Node.js >= 20 and pnpm >= 9.

## Before Submitting a PR

```bash
pnpm typecheck    # Zero type errors
pnpm lint         # Zero lint errors (Biome)
pnpm test         # All unit tests pass
```

## Adding a New Game

See the [Development Guide](docs/DEVELOPMENT.md) for the full walkthrough. In short:

1. Copy `games/_template/` to `games/<your-game>/`
2. Implement `shared.ts`, `logic.ts`, `Board.tsx`, `logic.test.ts`
3. Register the game in `server-registry.ts`, `client-registry.ts`, and config files
4. Run all checks above

## Code Style

- **Biome** handles formatting and linting -- run `pnpm lint:fix` to auto-fix
- Match existing patterns; don't refactor unrelated code
- No hardcoded colors -- use design tokens (`bg-card`, `text-muted-foreground`)
- UI must work at 375px width (mobile)

## Reporting Bugs

Open an [issue](https://github.com/Clarence-G/tablecraft/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS if relevant

## Feature Requests

Open an issue with the `enhancement` label. Describe the use case, not just the solution.
