// useFriendSearch — debounced search-as-you-type against /friends/search.
//
// The api endpoint requires `q.length >= 1`, but typing one character spams
// the backend. We hold off until the user pauses (250ms) and the trimmed
// query is at least two characters. Empty input collapses cleanly to idle.

import { useEffect, useRef, useState } from 'react';
import type { FriendSummary } from '@mei/types';
import { searchFriends } from '../api/friends';
import { ApiError } from '../api/client';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export type UseFriendSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; results: FriendSummary[] }
  | { status: 'error'; error: ApiError };

export function useFriendSearch(query: string): UseFriendSearchState {
  const [state, setState] = useState<UseFriendSearchState>({ status: 'idle' });
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    // Cancel any in-flight request from a prior keystroke.
    if (ctrlRef.current) ctrlRef.current.abort();

    if (trimmed.length < MIN_CHARS) {
      setState({ status: 'idle' });
      return;
    }

    const handle = setTimeout(() => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setState({ status: 'loading' });
      searchFriends(trimmed, { signal: ctrl.signal })
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setState({ status: 'success', results: res.items });
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          const apiErr =
            err instanceof ApiError
              ? err
              : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Search failed');
          setState({ status: 'error', error: apiErr });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  return state;
}
