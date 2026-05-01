import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useSession } from './useSession';

export interface FriendEntry {
  userId: string;
  name: string;
  status: 'online' | 'offline';
  currentRoomId?: string;
}

export interface PendingEntry {
  userId: string;
  name: string;
}

export interface FriendsData {
  friends: FriendEntry[];
  pending: {
    incoming: PendingEntry[];
    outgoing: PendingEntry[];
  };
}

export interface SearchUser {
  userId: string;
  name: string;
  relation: 'none' | 'pending_out' | 'pending_in';
}

const EMPTY: FriendsData = { friends: [], pending: { incoming: [], outgoing: [] } };

export function useFriends() {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const [data, setData] = useState<FriendsData>(EMPTY);
  const [isPending, setIsPending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await apiFetch<FriendsData>('/api/friends');
      setData(result);
    } catch {
      // keep stale data
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setData(EMPTY);
      return;
    }
    setIsPending(true);
    void load().finally(() => setIsPending(false));
    intervalRef.current = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [userId, load]);

  const sendRequest = useCallback(
    async (targetUserId: string) => {
      await apiFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      await load();
    },
    [load],
  );

  const acceptRequest = useCallback(
    async (requesterId: string) => {
      await apiFetch('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify({ userId: requesterId }),
      });
      await load();
    },
    [load],
  );

  const declineRequest = useCallback(
    async (requesterId: string) => {
      await apiFetch('/api/friends/decline', {
        method: 'POST',
        body: JSON.stringify({ userId: requesterId }),
      });
      await load();
    },
    [load],
  );

  const removeFriend = useCallback(
    async (targetUserId: string) => {
      await apiFetch(`/api/friends/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' });
      await load();
    },
    [load],
  );

  const searchUsers = useCallback(async (q: string): Promise<SearchUser[]> => {
    if (!q.trim()) return [];
    const result = await apiFetch<{ users: SearchUser[] }>(
      `/api/friends/search?q=${encodeURIComponent(q.trim())}`,
    );
    return result.users;
  }, []);

  return { data, isPending, sendRequest, acceptRequest, declineRequest, removeFriend, searchUsers };
}
