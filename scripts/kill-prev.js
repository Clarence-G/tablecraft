#!/usr/bin/env node
// Kill the previous dev server process group.
//
// Primary path: read PID from .dev.pid (written by the previous run) and
// SIGTERM that process group. Fallback: if port 3001 is still occupied by
// someone not tracked by our PID file (e.g. a tsx watch that survived a
// crash), kill the occupant so the fresh `pnpm dev` can bind.

import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PID_FILE = resolve(import.meta.dirname, '../.dev.pid');
const SERVER_PORT = Number(process.env.PORT) || 3001;
const CLIENT_PORT = 5173;

function killByPidFile() {
  let raw;
  try {
    raw = readFileSync(PID_FILE, 'utf-8').trim();
  } catch {
    return;
  }
  const pid = Number(raw);
  if (!pid || Number.isNaN(pid)) {
    unlinkSync(PID_FILE);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Process already exited.
  }
  try {
    unlinkSync(PID_FILE);
  } catch {}
}

function killPortOccupants(port) {
  // macOS/Linux: find listener pids and SIGTERM them. Safe because we only
  // kill things listening on our dev ports, never random processes.
  let out = '';
  try {
    out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return;
  }
  const pids = out
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  if (pids.length > 0) {
    // Give the processes a tick to release the port before `concurrently`
    // starts racing for it.
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      // Busy-wait is fine; we're about to exec children anyway.
    }
  }
}

killByPidFile();
killPortOccupants(SERVER_PORT);
killPortOccupants(CLIENT_PORT);

// Record the parent shell's PID so the NEXT dev run can target this run.
writeFileSync(PID_FILE, String(process.ppid ?? process.pid));
