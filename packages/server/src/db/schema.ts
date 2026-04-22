import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const rooms = pgTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    status: text('status').notNull(),
    hostId: text('host_id').notNull(),
    configJson: text('config_json'),
    seed: text('seed'),
    stateJson: text('state_json'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    statusIdx: index('idx_rooms_status').on(t.status),
  }),
);

export const roomPlayers = pgTable(
  'room_players',
  {
    roomId: text('room_id').notNull(),
    userId: text('user_id').notNull(),
    seatIndex: integer('seat_index').notNull(),
    ready: boolean('ready').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roomId, t.userId] }),
  }),
);

export const actionLog = pgTable(
  'action_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    roomId: text('room_id').notNull(),
    userId: text('user_id').notNull(),
    seq: integer('seq').notNull(),
    actionJson: text('action_json').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index('idx_action_room').on(t.roomId),
    uniqRoomUserSeq: uniqueIndex('uniq_action_room_user_seq').on(t.roomId, t.userId, t.seq),
  }),
);

export const botTokens = pgTable('bot_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().unique(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
});
