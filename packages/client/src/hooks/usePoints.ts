import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useIdentity } from './useIdentity';

export interface PointsSummary {
  global: number;
  byGame: Record<string, number>;
}

interface UsePointsResult {
  data: PointsSummary | null;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches a points summary for the effective actor:
 *   - signed in  → /api/me (session cookie)
 *   - guest      → /api/guest/:guestId/points (public)
 *
 * Re-fetches when the actor flips. No external state library — raw fetch +
 * AbortController + useEffect, per Stage 4 scope.
 */
export function usePoints(): UsePointsResult {
  const { isGuest, guestId } = useIdentity();
  const [data, setData] = useState<PointsSummary | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  // `tick` is deliberately in the deps: incrementing it is how refetch() re-runs the
  // effect without reading tick inside the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is a refetch trigger
  useEffect(() => {
    const controller = new AbortController();
    setIsPending(true);
    setError(null);

    const path = isGuest ? `/api/guest/${encodeURIComponent(guestId)}/points` : '/api/me';

    apiFetch<PointsSummary | { points: PointsSummary }>(path, { signal: controller.signal })
      .then((resp) => {
        // /api/me wraps the summary in { user, points, recentGames };
        // /api/guest/:id/points returns the summary directly.
        const summary =
          'points' in (resp as object)
            ? (resp as { points: PointsSummary }).points
            : (resp as PointsSummary);
        setData(summary);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPending(false);
      });

    return () => controller.abort();
  }, [isGuest, guestId, tick]);

  return { data, isPending, error, refetch };
}
