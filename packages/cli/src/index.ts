#!/usr/bin/env node

import { gameActionCommand, gameStateCommand, gameWaitCommand } from './commands/game.js';
import { gamesListCommand, gamesRulesCommand } from './commands/games.js';
import { loginCommand, whoamiCommand } from './commands/login.js';
import {
  roomsCreateCommand,
  roomsJoinCommand,
  roomsLeaveCommand,
  roomsListCommand,
  roomsShowCommand,
  roomsStartCommand,
} from './commands/rooms.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ApiClient } from './lib/client.js';
import { resolveConfig } from './lib/config.js';

function resolveSkillPath(): string | null {
  // Runtime: dist/index.js → look for ../skills/tablecraft-player (npm tarball layout)
  // Dev:     src/index.ts  → look for ../../../skill_data/tablecraft-player
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../skills/tablecraft-player'),
    resolve(here, '../../skills/tablecraft-player'),
    resolve(here, '../../../skill_data/tablecraft-player'),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

function output(data: unknown): void {
  console.log(JSON.stringify(data));
}

function fail(message: string): never {
  output({
    ok: false,
    error: 'USAGE',
    message,
    hint: 'Run "tablecraft" with no args to see usage',
  });
  process.exit(1);
}

function requireClient(): { client: ApiClient; config: { server: string; token: string } } {
  const config = resolveConfig();
  if (!config) {
    output({
      ok: false,
      error: 'NOT_LOGGED_IN',
      message: 'Not logged in',
      hint: 'Run: tablecraft login --server <url> --token <token>',
    });
    process.exit(1);
  }
  return { client: new ApiClient(config), config };
}

const USAGE = `Usage: tablecraft <command> [args]

Auth:
  login --server <url> --token <token>    Save credentials
  whoami                                   Show current identity

Games:
  games list                              List available games
  games rules <gameId>                    Show game rules for agent

Rooms:
  rooms list [--game <gameId>]            List joinable rooms
  rooms create <gameId>                   Create a room
  rooms show <roomId>                     Show room state
  rooms join <roomId>                     Join a room
  rooms leave <roomId>                    Leave a room
  rooms start <roomId>                    Start the game

Game:
  game state <roomId>                     Get current game state
  game action <roomId> '<json>'           Submit an action
  game wait <roomId> [--after N] [--timeout S]  Wait for state change

Skill:
  skill-path                               Print absolute path to the bundled tablecraft-player skill`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(USAGE);
    process.exit(0);
  }

  const command = args[0];
  const sub = args[1];
  const rest = args.slice(2);

  try {
    let result: unknown;

    switch (command) {
      case 'login':
        result = await loginCommand(args.slice(1));
        break;

      case 'whoami': {
        const { client, config } = requireClient();
        result = await whoamiCommand(client, config.server);
        break;
      }

      case 'games':
        switch (sub) {
          case 'list':
            result = await gamesListCommand(requireClient().client);
            break;
          case 'rules':
            result = await gamesRulesCommand(requireClient().client, rest);
            break;
          default:
            fail(`Unknown games command: ${sub}`);
        }
        break;

      case 'rooms':
        switch (sub) {
          case 'list':
            result = await roomsListCommand(requireClient().client, rest);
            break;
          case 'create':
            result = await roomsCreateCommand(requireClient().client, rest);
            break;
          case 'show':
            result = await roomsShowCommand(requireClient().client, rest);
            break;
          case 'join':
            result = await roomsJoinCommand(requireClient().client, rest);
            break;
          case 'leave':
            result = await roomsLeaveCommand(requireClient().client, rest);
            break;
          case 'start':
            result = await roomsStartCommand(requireClient().client, rest);
            break;
          default:
            fail(`Unknown rooms command: ${sub}`);
        }
        break;

      case 'game':
        switch (sub) {
          case 'state':
            result = await gameStateCommand(requireClient().client, rest);
            break;
          case 'action':
            result = await gameActionCommand(requireClient().client, rest);
            break;
          case 'wait':
            result = await gameWaitCommand(requireClient().client, rest);
            break;
          default:
            fail(`Unknown game command: ${sub}`);
        }
        break;

      case 'skill-path': {
        const p = resolveSkillPath();
        if (!p) {
          result = {
            ok: false,
            error: 'SKILL_NOT_FOUND',
            message: 'Bundled skill not found. If running from source, build first: pnpm build',
          };
        } else {
          result = {
            ok: true,
            path: p,
            hint: 'For Claude Code: ln -s "' + p + '" ~/.claude/skills/tablecraft-player',
          };
        }
        break;
      }

      default:
        fail(`Unknown command: ${command}`);
    }

    output(result);
    const ok = result && typeof result === 'object' && 'ok' in result && (result as any).ok;
    process.exit(ok ? 0 : 1);
  } catch (err: any) {
    output({
      ok: false,
      error: 'NETWORK_ERROR',
      message: err.message || 'Request failed',
      hint: 'Check that the server is running and accessible',
    });
    process.exit(1);
  }
}

main();
