// useFriendsHub — single source of truth for the Add Friends screen.
//
// The screen has three tabs (Friends / Suggested / Pending) plus search,
// and they share a state graph: accepting an inbound request adds to
// Friends, declining clears Pending, sending a request adds to outbound,
// etc. Holding the four lists in one hook lets us update them in lockstep
// without going back to the network for every action — and only re-fetch
// the affected slice as a safety net.
//
// We deliberately avoid pulling in react-query for this PR; the surface is
// small, and a typed state machine reads more clearly than an opaque cache.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FriendRequestWithUser,
  FriendSuggestion,
  FriendSummary,
} from '@mei/types';

import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import {
  acceptFriendRequest as apiAcceptFriendRequest,
  cancelFriendRequest as apiCancelFriendRequest,
  declineFriendRequest as apiDeclineFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  fetchSuggestedFriends,
  sendFriendRequest as apiSendFriendRequest,
  unfriend as apiUnfriend,
} from '../api/friends';

interface FriendsState {
  friends: FriendSummary[];
  suggested: FriendSuggestion[];
  inbound: FriendRequestWithUser[];
  outbound: FriendRequestWithUser[];
}

export type UseFriendsHubState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: FriendsState; refetching: boolean }
  | { status: 'error'; error: ApiError; lastData?: FriendsState };

export interface UseFriendsHubResult {
  state: UseFriendsHubState;
  refetch: () => Promise<void>;
  /** True when an action against this user is in flight. */
  isPending: (userId: string) => boolean;
  sendRequest: (toUserId: string) => Promise<void>;
  acceptRequest: (fromUserId: string) => Promise<void>;
  declineRequest: (fromUserId: string) => Promise<void>;
  cancelRequest: (toUserId: string) => Promise<void>;
  unfriend: (userId: string) => Promise<void>;
}

function emptyState(): FriendsState {
  return { friends: [], suggested: [], inbound: [], outbound: [] };
}

export function useFriendsHub(): UseFriendsHubResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseFriendsHubState>({ status: 'idle' });
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const setBusy = useCallback((userId: string, busy: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (busy) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      setState((prev) => {
        if (isRefetch && prev.status === 'success') {
          return { ...prev, refetching: true };
        }
        return { status: 'loading' };
      });
      try {
        const [friends, suggested, requests] = await Promise.all([
          fetchFriends({ signal }),
          fetchSuggestedFriends({ signal }),
          fetchFriendRequests({ signal }),
        ]);
        if (signal.aborted) return;
        setState({
          status: 'success',
          data: {
            friends: friends.items,
            suggested: suggested.items,
            inbound: requests.inbound,
            outbound: requests.outbound,
          },
          refetching: false,
        });
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

  // Local mutators — keep the cache aligned without re-fetching.
  const updateData = useCallback((mutate: (d: FriendsState) => FriendsState) => {
    setState((prev) => {
      const data =
        prev.status === 'success'
          ? prev.data
          : prev.status === 'error' && prev.lastData
            ? prev.lastData
            : null;
      if (!data) return prev;
      const next = mutate(data);
      if (prev.status === 'success') return { ...prev, data: next };
      if (prev.status === 'error') return { ...prev, lastData: next };
      return prev;
    });
  }, []);

  const sendRequest = useCallback(
    async (toUserId: string) => {
      if (pending.has(toUserId)) return;
      setBusy(toUserId, true);
      try {
        const created = await apiSendFriendRequest({ toUserId });
        const me = session?.user.id;
        if (!me) return;
        // Optimistically attach the suggestion/search-result user details
        // to the new outbound row so the UI can render it without re-fetching.
        const counterparty: FriendSummary | undefined = (() => {
          const fromSuggested = state.status === 'success'
            ? state.data.suggested.find((s) => s.userId === toUserId)
            : undefined;
          if (fromSuggested) return fromSuggested;
          // No suggestion match — caller must have search context. Return a
          // minimal placeholder; refetch will fill it in.
          return undefined;
        })();
        updateData((d) => ({
          ...d,
          outbound: [
            ...d.outbound,
            {
              fromUserId: me,
              toUserId,
              createdAt: created.createdAt,
              status: created.status,
              user: counterparty ?? {
                userId: toUserId,
                username: '…',
                displayName: '…',
              },
            },
          ],
        }));
        // Settle counterparty info (and any concurrent state) from server.
        void refetch();
      } finally {
        setBusy(toUserId, false);
      }
    },
    [pending, setBusy, session, state, updateData, refetch],
  );

  const acceptRequest = useCallback(
    async (fromUserId: string) => {
      if (pending.has(fromUserId)) return;
      setBusy(fromUserId, true);
      try {
        const { friend } = await apiAcceptFriendRequest(fromUserId);
        updateData((d) => ({
          ...d,
          inbound: d.inbound.filter((r) => r.fromUserId !== fromUserId),
          friends: d.friends.some((f) => f.userId === friend.userId)
            ? d.friends
            : [friend, ...d.friends],
        }));
      } finally {
        setBusy(fromUserId, false);
      }
    },
    [pending, setBusy, updateData],
  );

  const declineRequest = useCallback(
    async (fromUserId: string) => {
      if (pending.has(fromUserId)) return;
      setBusy(fromUserId, true);
      try {
        await apiDeclineFriendRequest(fromUserId);
        updateData((d) => ({
          ...d,
          inbound: d.inbound.filter((r) => r.fromUserId !== fromUserId),
        }));
      } finally {
        setBusy(fromUserId, false);
      }
    },
    [pending, setBusy, updateData],
  );

  const cancelRequest = useCallback(
    async (toUserId: string) => {
      if (pending.has(toUserId)) return;
      setBusy(toUserId, true);
      try {
        await apiCancelFriendRequest(toUserId);
        updateData((d) => ({
          ...d,
          outbound: d.outbound.filter((r) => r.toUserId !== toUserId),
        }));
      } finally {
        setBusy(toUserId, false);
      }
    },
    [pending, setBusy, updateData],
  );

  const unfriend = useCallback(
    async (userId: string) => {
      if (pending.has(userId)) return;
      setBusy(userId, true);
      try {
        await apiUnfriend(userId);
        updateData((d) => ({
          ...d,
          friends: d.friends.filter((f) => f.userId !== userId),
        }));
      } finally {
        setBusy(userId, false);
      }
    },
    [pending, setBusy, updateData],
  );

  const isPending = useCallback((userId: string) => pending.has(userId), [pending]);

  return useMemo(
    () => ({
      state,
      refetch,
      isPending,
      sendRequest,
      acceptRequest,
      declineRequest,
      cancelRequest,
      unfriend,
    }),
    [state, refetch, isPending, sendRequest, acceptRequest, declineRequest, cancelRequest, unfriend],
  );
}
