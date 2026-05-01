// Typed wrappers for the api Lambda's `/friends` domain (SPEC §10.12).
//
// Covers the subset needed by the Add Friends screen in this PR:
//   - list / search / suggested
//   - request lifecycle: send, list (inbound + outbound), accept, decline,
//     cancel
//   - unfriend
//
// Skipped for now (own follow-ups): contactsMatch (P1 — needs phone hashing
// on device), getPublicProfile, listUserOotds (need OOTD wiring first).

import type {
  AcceptFriendRequestResponse,
  CancelFriendRequestResponse,
  DeclineFriendRequestResponse,
  ListFriendRequestsResponse,
  ListFriendsResponse,
  SearchFriendsResponse,
  SendFriendRequestBody,
  SendFriendRequestResponse,
  SuggestedFriendsResponse,
  UnfriendResponse,
} from '@mei/types';

import { apiFetch } from './client';

/** GET /friends — caller's accepted friends. */
export function fetchFriends(opts: { signal?: AbortSignal } = {}): Promise<ListFriendsResponse> {
  return apiFetch<ListFriendsResponse>('/friends', { signal: opts.signal });
}

/** GET /friends/search?q={q}. Results limited to discoverable users. */
export function searchFriends(
  q: string,
  opts: { signal?: AbortSignal } = {},
): Promise<SearchFriendsResponse> {
  const url = `/friends/search?q=${encodeURIComponent(q)}`;
  return apiFetch<SearchFriendsResponse>(url, { signal: opts.signal });
}

/** GET /friends/suggested — server-stubbed in P0. */
export function fetchSuggestedFriends(
  opts: { signal?: AbortSignal } = {},
): Promise<SuggestedFriendsResponse> {
  return apiFetch<SuggestedFriendsResponse>('/friends/suggested', { signal: opts.signal });
}

/** GET /friends/requests — inbound + outbound pending. */
export function fetchFriendRequests(
  opts: { signal?: AbortSignal } = {},
): Promise<ListFriendRequestsResponse> {
  return apiFetch<ListFriendRequestsResponse>('/friends/requests', { signal: opts.signal });
}

/** POST /friends/requests — send a friend request. */
export function sendFriendRequest(
  body: SendFriendRequestBody,
  opts: { signal?: AbortSignal } = {},
): Promise<SendFriendRequestResponse> {
  return apiFetch<SendFriendRequestResponse>('/friends/requests', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}

/** POST /friends/requests/:fromUserId/accept — accept an inbound request. */
export function acceptFriendRequest(
  fromUserId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<AcceptFriendRequestResponse> {
  return apiFetch<AcceptFriendRequestResponse>(
    `/friends/requests/${encodeURIComponent(fromUserId)}/accept`,
    { method: 'POST', signal: opts.signal },
  );
}

/** POST /friends/requests/:fromUserId/decline — decline an inbound request. */
export function declineFriendRequest(
  fromUserId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<DeclineFriendRequestResponse> {
  return apiFetch<DeclineFriendRequestResponse>(
    `/friends/requests/${encodeURIComponent(fromUserId)}/decline`,
    { method: 'POST', signal: opts.signal },
  );
}

/** DELETE /friends/requests/:toUserId — cancel an outbound request. */
export function cancelFriendRequest(
  toUserId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<CancelFriendRequestResponse> {
  return apiFetch<CancelFriendRequestResponse>(
    `/friends/requests/${encodeURIComponent(toUserId)}`,
    { method: 'DELETE', signal: opts.signal },
  );
}

/** DELETE /friends/:userId — unfriend. */
export function unfriend(
  userId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<UnfriendResponse> {
  return apiFetch<UnfriendResponse>(`/friends/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    signal: opts.signal,
  });
}
