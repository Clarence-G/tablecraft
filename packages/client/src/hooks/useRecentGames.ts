import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useSession } from './useSession';

export interface RecentGame {
  gameId: string;
  roomId: string;
  result: 'win' | 'loss' | 'draw';
  endedAt: string;
}

interface UseRecentGamesResult {
  data: RecentGame[];
  isPending: boolean;
}

interface MeResponse {
  recentGames: RecentGame[];
}

/**
 * Fetches the current user's most-recently-played games from /api/me.
 * Empty array when signed out (no request made). No external state library.
 */
export function useRecentGames(): UseRecentGamesResult {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const [data, setData] = useState<RecentGame[]>([]);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setIsPending(false);
      return;
    }
    const controller = new AbortController();
    setIsPending(true);
    apiFetch<MeResponse>('/api/me', { signal: controller.signal })
      .then((resp) => {
        if (controller.signal.aborted) return;
        setData(resp.recentGames ?? []);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPending(false);
      });
    return () => controller.abort();
  }, [userId]);

  return { data, isPending };
}
