// useToday — fetches the GET /today aggregate and exposes a tiny state
// machine the screen can render against.
//
// We deliberately avoid pulling in a query library (react-query etc.) for
// Wave 3 — the surface area is small enough that a hand-rolled hook stays
// readable and ships faster. If/when caching, retries, and revalidation
// matter, swap this internal for the right tool; the public shape can stay.

import { useCallback, useEffect, useState } from 'react';
import type { GetTodayResponse } from '@mei/types';
import { fetchToday } from '../api/today';
import { ApiError } from '../api/client';
import { useSession } from '../auth/SessionProvider';

export type UseTodayState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: GetTodayResponse; refetching: boolean }
  | { status: 'error'; error: ApiError; lastData?: GetTodayResponse };

export interface UseTodayResult {
  state: UseTodayState;
  /** Re-fetch (e.g. pull-to-refresh). Resolves with the new payload. */
  refetch: () => Promise<void>;
}

export function useToday(): UseTodayResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseTodayState>({ status: 'idle' });

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      // Mark loading appropriately. On refetch, keep the existing data on
      // screen and flip the `refetching` flag so the UI can show a subtle
      // indicator without unmounting the content.
      setState((prev) => {
        if (isRefetch && prev.status === 'success') {
          return { ...prev, refetching: true };
        }
        return { status: 'loading' };
      });
      try {
        const data = await fetchToday({ signal });
        if (signal.aborted) return;
        setState({ status: 'success', data, refetching: false });
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown error');
        setState((prev) =>
          prev.status === 'success'
            ? { status: 'error', error: apiErr, lastData: prev.data }
            : { status: 'error', error: apiErr },
        );
      }
    },
    [],
  );

  // Initial fetch, gated on the session existing. Re-runs when the user signs
  // in or out — sign-out collapses to `idle` so we don't show stale data.
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
