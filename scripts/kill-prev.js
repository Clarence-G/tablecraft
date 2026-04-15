#!/usr/bin/env node
// Kill the previous dev server process group using a saved PID file.
// Safe: only kills the process we started, never random port occupants.

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PID_FILE = resolve(import.meta.dirname, '../.dev.pid');

function killPrev() {
  let raw;
  try {
    raw = readFileSync(PID_FILE, 'utf-8').trim();
  } catch {
    return; // no pid file — nothing to kill
  }

  const pid = Number(raw);
  if (!pid || Number.isNaN(pid)) {
    unlinkSync(PID_FILE);
    return;
  }

  try {
    // Kill the process group (negative pid) so child processes also die
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Process already exited — ignore
  }

  try {
    unlinkSync(PID_FILE);
  } catch {
    // file already gone
  }
}

// When called directly: kill previous, then write current PID
killPrev();
writeFileSync(PID_FILE, String(process.ppid ?? process.pid));
