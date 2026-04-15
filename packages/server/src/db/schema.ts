import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  status: text('status').notNull(),
  hostId: text('host_id').notNull(),
  configJson: text('config_json'),
  seed: text('seed'),
  stateJson: text('state_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const roomPlayers = sqliteTable('room_players', {
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),
  seatIndex: integer('seat_index').notNull(),
  ready: integer('ready').notNull().default(0),
});

export const actionLog = sqliteTable('action_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),
  seq: integer('seq').notNull(),
  actionJson: text('action_json').notNull(),
  timestamp: integer('timestamp').notNull(),
});
