#!/usr/bin/env node
// Build the client (unless --skip-build) and start the server on the LAN
// with NODE_ENV=production. The server is run via tsx because the monorepo's
// game and shared packages export .ts files directly.
//
// Prints every LAN IPv4 URL so other devices on the same network can connect.

import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const skipBuild = process.argv.includes('--skip-build');
const PORT = process.env.PORT ?? '3001';
const ROOT = resolve(import.meta.dirname, '..');

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const net of ifaces ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

if (!skipBuild) {
  const r = spawnSync('pnpm', ['--filter', '@repo/client', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const banner = [
  '',
  '  TableCraft — LAN mode',
  `    local:    http://localhost:${PORT}`,
  ...lanAddresses().map((a) => `    network:  http://${a}:${PORT}`),
  '',
].join('\n');
console.log(banner);

const server = spawn('pnpm', ['--filter', '@repo/server', 'exec', 'tsx', 'src/index.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT },
});

const forward = (sig) => () => server.kill(sig);
process.on('SIGINT', forward('SIGINT'));
process.on('SIGTERM', forward('SIGTERM'));
server.on('exit', (code) => process.exit(code ?? 0));
