import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type { Request, Response, Router } from 'express';
import { db } from '../db/index.js';
import { friendships, user, userBlocks } from '../db/schema.js';
import type { RoomManager } from '../engine/RoomManager.js';

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function escapeIlike(q: string): string {
  return q.replace(/[%_\\]/g, '\\$&');
}

export function registerFriendsRoutes(router: Router, roomManager: RoomManager): void {
  // GET /api/friends
  router.get('/friends', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const rows = await db.select().from(friendships).where(
      or(eq(friendships.userA, userId), eq(friendships.userB, userId)),
    );

    const accepted = rows.filter((r) => r.status === 'accepted');
    const pending = rows.filter((r) => r.status === 'pending');

    const friendIds = accepted.map((r) => (r.userA === userId ? r.userB : r.userA));
    const incoming = pending.filter((r) => r.requestedBy !== userId);
    const outgoing = pending.filter((r) => r.requestedBy === userId);

    const allIds = [
      ...friendIds,
      ...incoming.map((r) => r.requestedBy),
      ...outgoing.map((r) => (r.userA === userId ? r.userB : r.userA)),
    ];
    const uniqueIds = [...new Set(allIds)];

    let userMap: Map<string, string> = new Map();
    if (uniqueIds.length > 0) {
      const users = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, uniqueIds));
      userMap = new Map(users.map((u) => [u.id, u.name]));
    }

    const buildPresence = (uid: string) => {
      const room = roomManager.findRoomByUser(uid);
      if (!room) return { status: 'offline' as const };
      const player = room.players.get(uid);
      if (player?.connected) return { status: 'online' as const, currentRoomId: room.roomId };
      return { status: 'offline' as const };
    };

    const friendList = friendIds.map((uid) => ({
      userId: uid,
      name: userMap.get(uid) ?? uid,
      ...buildPresence(uid),
    }));

    const incomingList = incoming.map((r) => ({
      userId: r.requestedBy,
      name: userMap.get(r.requestedBy) ?? r.requestedBy,
    }));

    const outgoingList = outgoing.map((r) => {
      const uid = r.userA === userId ? r.userB : r.userA;
      return { userId: uid, name: userMap.get(uid) ?? uid };
    });

    res.json({ ok: true, data: { friends: friendList, pending: { incoming: incomingList, outgoing: outgoingList } } });
  });

  // GET /api/friends/search?q=
  router.get('/friends/search', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return void res.json({ ok: true, data: { users: [] } });

    const [blocks, myFriendships] = await Promise.all([
      db.select().from(userBlocks).where(
        or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)),
      ),
      db.select().from(friendships).where(
        or(eq(friendships.userA, userId), eq(friendships.userB, userId)),
      ),
    ]);

    const blockedIds = new Set(
      blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
    );

    const relationMap = new Map<string, 'accepted' | 'pending_out' | 'pending_in'>();
    for (const row of myFriendships) {
      const otherId = row.userA === userId ? row.userB : row.userA;
      if (row.status === 'accepted') {
        relationMap.set(otherId, 'accepted');
      } else if (row.requestedBy === userId) {
        relationMap.set(otherId, 'pending_out');
      } else {
        relationMap.set(otherId, 'pending_in');
      }
    }

    const results = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(ilike(user.name, `${escapeIlike(q)}%`))
      .limit(40);

    const filtered = results
      .filter((u) => u.id !== userId && !blockedIds.has(u.id) && relationMap.get(u.id) !== 'accepted')
      .slice(0, 20)
      .map((u) => ({
        userId: u.id,
        name: u.name,
        relation: (relationMap.get(u.id) ?? 'none') as 'none' | 'pending_out' | 'pending_in',
      }));

    res.json({ ok: true, data: { users: filtered } });
  });

  // POST /api/friends/request
  router.post('/friends/request', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const { targetUserId } = req.body ?? {};
    if (!targetUserId || typeof targetUserId !== 'string') {
      return void res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST' } });
    }
    if (targetUserId === userId) {
      return void res.status(400).json({ ok: false, error: { code: 'SELF_REQUEST' } });
    }

    const block = await db.select().from(userBlocks).where(
      or(
        and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetUserId)),
        and(eq(userBlocks.blockerId, targetUserId), eq(userBlocks.blockedId, userId)),
      ),
    );
    if (block.length > 0) {
      return void res.status(400).json({ ok: false, error: { code: 'BLOCKED' } });
    }

    const [a, b] = normalizePair(userId, targetUserId);

    const existing = await db.select().from(friendships).where(
      and(eq(friendships.userA, a), eq(friendships.userB, b)),
    );

    if (existing.length > 0) {
      const row = existing[0]!;
      if (row.status === 'accepted') {
        return void res.status(409).json({ ok: false, error: { code: 'ALREADY_FRIENDS' } });
      }
      // Other party already requested: auto-accept
      if (row.requestedBy !== userId) {
        await db.update(friendships)
          .set({ status: 'accepted', acceptedAt: new Date() })
          .where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
        return void res.json({ ok: true, data: { status: 'accepted' } });
      }
      // Idempotent duplicate
      return void res.json({ ok: true, data: { status: 'pending' } });
    }

    await db.insert(friendships).values({ userA: a, userB: b, requestedBy: userId, status: 'pending' });
    res.json({ ok: true, data: { status: 'pending' } });
  });

  // POST /api/friends/accept
  router.post('/friends/accept', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const { userId: requesterId } = req.body ?? {};
    if (!requesterId || typeof requesterId !== 'string') {
      return void res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST' } });
    }

    const [a, b] = normalizePair(userId, requesterId);

    const existing = await db.select().from(friendships).where(
      and(eq(friendships.userA, a), eq(friendships.userB, b)),
    );

    const row = existing[0];
    if (!row || row.status !== 'pending' || row.requestedBy !== requesterId) {
      return void res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
    }

    await db.update(friendships)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(friendships.userA, a), eq(friendships.userB, b)));

    res.json({ ok: true });
  });

  // POST /api/friends/decline
  router.post('/friends/decline', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const { userId: requesterId } = req.body ?? {};
    if (!requesterId || typeof requesterId !== 'string') {
      return void res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST' } });
    }

    const [a, b] = normalizePair(userId, requesterId);

    const existing = await db.select().from(friendships).where(
      and(eq(friendships.userA, a), eq(friendships.userB, b)),
    );

    const row = existing[0];
    if (!row || row.status !== 'pending' || row.requestedBy === userId) {
      return void res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
    }

    await db.delete(friendships).where(
      and(eq(friendships.userA, a), eq(friendships.userB, b)),
    );

    res.json({ ok: true });
  });

  // DELETE /api/friends/:userId
  router.delete('/friends/:userId', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return void res.status(401).json({ ok: false, error: { code: 'UNAUTH' } });

    const targetId = req.params.userId;
    const [a, b] = normalizePair(userId, targetId);

    const deleted = await db.delete(friendships).where(
      and(eq(friendships.userA, a), eq(friendships.userB, b)),
    ).returning();

    if (deleted.length === 0) {
      return void res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
    }

    res.json({ ok: true });
  });
}
