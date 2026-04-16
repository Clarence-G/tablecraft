import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.tabletop');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  server: string;
  token: string;
}

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export function resolveConfig(): Config | null {
  // Priority: env var > config file
  const server = process.env.TABLETOP_SERVER;
  const token = process.env.TABLETOP_TOKEN;
  const saved = loadConfig();

  const resolvedServer = server || saved?.server;
  const resolvedToken = token || saved?.token;

  if (!resolvedServer || !resolvedToken) return null;
  return { server: resolvedServer, token: resolvedToken };
}
