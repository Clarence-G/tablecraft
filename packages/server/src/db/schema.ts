import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

// ---------------------------------------------------------------------------
// BetterAuth tables (email+password + social login). These coexist with the
// legacy `users` (plural) table above, which is still referenced by
// `room_players.user_id`. The BetterAuth adapter manages these four tables.
// `user.claimed_guest_id` is a business extension for the guest→user merge
// flow (see spec §4.3); it is not part of the stock BetterAuth schema.
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  // Business extension: stores the guest userId that was merged into this
  // account at first login. Used by Stage 4 /api/me/claim-guest to roll the
  // guest's points/rooms into the real account.
  claimedGuestId: text('claimed_guest_id').unique(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    userIdx: index('session_user_id_idx').on(t.userId),
  }),
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('account_user_id_idx').on(t.userId),
  }),
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow(),
  },
  (t) => ({
    identifierIdx: index('verification_identifier_idx').on(t.identifier),
  }),
);

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

// ---------------------------------------------------------------------------
// Points ledger (spec §3.2). Append-only record of point awards. Owner is
// either a BetterAuth user (userId) or an anonymous guest (guestId); the
// CHECK constraint requires exactly one of them to be set. `reason` is a
// free-form string constrained at the application layer to one of
// 'win' | 'draw' | 'loss' | 'daily_checkin' | 'admin_grant'.
// ---------------------------------------------------------------------------

export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    guestId: text('guest_id'),
    gameId: text('game_id').notNull(),
    roomId: text('room_id'),
    reason: text('reason').notNull(),
    points: integer('points').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('idx_points_user_created').on(t.userId, t.createdAt),
    gameIdx: index('idx_points_game_created').on(t.gameId, t.createdAt),
    guestIdx: index('idx_points_guest').on(t.guestId),
    ownerCheck: check(
      'points_ledger_owner_check',
      sql`user_id IS NOT NULL OR guest_id IS NOT NULL`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Chat messages (persisted). GameRoom keeps a hot in-memory cache but
// messages are now durable across restarts.
// ---------------------------------------------------------------------------
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    roomId: text('room_id').notNull(),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index('idx_chat_room_created').on(t.roomId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// User reports (moderation). A reporter flags a target for a reason, with an
// optional roomId for game-context reports. Status tracks triage state.
// ---------------------------------------------------------------------------
export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    reporterId: text('reporter_id').notNull(),
    targetUserId: text('target_user_id').notNull(),
    roomId: text('room_id'),
    reason: text('reason').notNull(),   // 'harassment' | 'cheating' | 'spam' | 'other'
    detail: text('detail'),              // free-form user-provided text, max 500 chars
    status: text('status').notNull().default('pending'),  // 'pending' | 'reviewed' | 'actioned' | 'dismissed'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    targetIdx: index('idx_reports_target').on(t.targetUserId),
    statusIdx: index('idx_reports_status_created').on(t.status, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// User blocks (personal blocklist). blocker cannot see blocked user's chat
// and is auto-matched away from blocked users when matchmaking lands.
// ---------------------------------------------------------------------------
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id').notNull(),
    blockedId: text('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
    blockerIdx: index('idx_blocks_blocker').on(t.blockerId),
  }),
);

// ---------------------------------------------------------------------------
// Friendships. Undirected, but stored as a pair where userA < userB
// lexicographically (normalize at insert). `status`: 'pending' | 'accepted'
// where `requestedBy` indicates who sent the initial request.
// ---------------------------------------------------------------------------
export const friendships = pgTable(
  'friendships',
  {
    userA: text('user_a').notNull(),    // lexicographically smaller id
    userB: text('user_b').notNull(),    // lexicographically larger id
    requestedBy: text('requested_by').notNull(),  // either userA or userB
    status: text('status').notNull().default('pending'),  // 'pending' | 'accepted'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userA, t.userB] }),
    userAIdx: index('idx_friendships_user_a').on(t.userA),
    userBIdx: index('idx_friendships_user_b').on(t.userB),
    check: check(
      'friendships_normalized_check',
      sql`user_a < user_b`,
    ),
  }),
);
