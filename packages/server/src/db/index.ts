import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/tabletop.db');

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export function initDb(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      status TEXT NOT NULL,
      host_id TEXT NOT NULL,
      config_json TEXT,
      seed TEXT,
      state_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS room_players (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      seat_index INTEGER NOT NULL,
      ready INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      action_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      UNIQUE (room_id, user_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_action_room ON action_log(room_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
  `);
}
