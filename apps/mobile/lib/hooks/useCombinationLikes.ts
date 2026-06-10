// useCombinationLikes — server-backed saved-look heart state.
//
// The Today card owns presentation, this hook owns the optimistic mutation
// and rollback behavior for `/me/likes`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { fetchMeLikes, likeCombination, unlikeCombination } from '../api/me';
import { useSession } from '../auth/SessionProvider';

export interface UseCombinationLikesResult {
  likedComboIds: ReadonlySet<string>;
  error: ApiError | null;
  toggleLike: (comboId: string) => Promise<void>;
}

export function useCombinationLikes(): UseCombinationLikesResult {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      setLikedIds([]);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    setError(null);
    (async () => {
      try {
        const res = await fetchMeLikes({ signal: ctrl.signal });
        if (!ctrl.signal.aborted) setLikedIds(res.comboIds);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown'),
        );
      }
    })();

    return () => ctrl.abort();
  }, [sessionLoading, userId]);

  const likedComboIds = useMemo(() => new Set(likedIds), [likedIds]);

  const toggleLike = useCallback(
    async (comboId: string) => {
      if (!userId) return;
      if (pendingIdsRef.current.has(comboId)) return;
      pendingIdsRef.current.add(comboId);

      const wasLiked = likedComboIds.has(comboId);
      const previous = likedIds;
      const next = new Set(likedIds);
      if (wasLiked) next.delete(comboId);
      else next.add(comboId);

      setError(null);
      setLikedIds(Array.from(next));

      try {
        if (wasLiked) await unlikeCombination(comboId);
        else await likeCombination(comboId);
      } catch (err) {
        setLikedIds(previous);
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown'),
        );
      } finally {
        pendingIdsRef.current.delete(comboId);
      }
    },
    [likedComboIds, likedIds, userId],
  );

  return { likedComboIds, error, toggleLike };
}
