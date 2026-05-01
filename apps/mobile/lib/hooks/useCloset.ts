// useCloset — items + combinations in one state graph.
//
// Both lists are loaded in parallel on mount; refetch invalidates both. The
// filter chips on the closet screen narrow what we render, but they don't
// re-fetch — the full closet is bounded (tens to low-hundreds in P0) and
// keeping the filter client-side feels instant. When closets get larger
// we can switch to per-category server-side pagination.

import { useCallback, useEffect, useState } from 'react';
import type { ClosetItem, Combination } from '@mei/types';
import { ApiError } from '../api/client';
import { fetchClosetCombinations, fetchClosetItems } from '../api/closet';
import { useSession } from '../auth/SessionProvider';

const PAGE_SIZE = 100; // Generous cap — P0 closets fit comfortably.

interface ClosetData {
  items: ClosetItem[];
  combinations: Combination[];
}

export type UseClosetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ClosetData; refetching: boolean }
  | { status: 'error'; error: ApiError; lastData?: ClosetData };

export interface UseClosetResult {
  state: UseClosetState;
  refetch: () => Promise<void>;
}

export function useCloset(): UseClosetResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseClosetState>({ status: 'idle' });

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      if (!session) return;
      setState((prev) => {
        if (isRefetch && prev.status === 'success') return { ...prev, refetching: true };
        return { status: 'loading' };
      });
      try {
        const [items, combos] = await Promise.all([
          fetchClosetItems({ signal, limit: PAGE_SIZE }),
          fetchClosetCombinations({ signal, limit: PAGE_SIZE }),
        ]);
        if (signal.aborted) return;
        setState({
          status: 'success',
          data: { items: items.items, combinations: combos.items },
          refetching: false,
        });
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        setState((prev) =>
          prev.status === 'success'
            ? { status: 'error', error: apiErr, lastData: prev.data }
            : { status: 'error', error: apiErr },
        );
      }
    },
    [session],
  );

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal, false);
    return () => ctrl.abort();
  }, [session, sessionLoading, load]);

  const refetch = useCallback(async () => {
    if (!session) return;
    const ctrl = new AbortController();
    await load(ctrl.signal, true);
  }, [session, load]);

  return { state, refetch };
}
