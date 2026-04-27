// Friends contracts — SPEC.md §7.2 "Friends".

import { z } from 'zod';
import { zFriendRequest } from '../entities.js';

// A trimmed-down public-facing user shape used in lists/search/suggestions.
// Mirrors what's safe to expose without leaking private profile fields.
export const zFriendSummary = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().optional(),
  city: z.string().optional(),
  countryCode: z.string().length(2).optional(),
});
export type FriendSummary = z.infer<typeof zFriendSummary>;

// ---------- GET /friends ----------

export const ListFriendsResponse = z.object({
  items: z.array(zFriendSummary),
});
export type ListFriendsResponse = z.infer<typeof ListFriendsResponse>;

// ---------- GET /friends/search?q= ----------

export const SearchFriendsQuery = z.object({
  q: z.string().min(1).max(80),
});
export type SearchFriendsQuery = z.infer<typeof SearchFriendsQuery>;

export const SearchFriendsResponse = z.object({
  items: z.array(zFriendSummary),
});
export type SearchFriendsResponse = z.infer<typeof SearchFriendsResponse>;

// ---------- GET /friends/suggested ----------

export const zSuggestionReason = z.enum([
  'COMMUNITY_LOOK_INTERACTION',
  'CONTACT_MATCH',
  'MUTUAL_FRIEND',
]);
export type SuggestionReason = z.infer<typeof zSuggestionReason>;

export const zFriendSuggestion = zFriendSummary.extend({
  reason: zSuggestionReason,
  mutualCount: z.number().int().nonnegative().optional(),
});
export type FriendSuggestion = z.infer<typeof zFriendSuggestion>;

export const SuggestedFriendsResponse = z.object({
  items: z.array(zFriendSuggestion),
});
export type SuggestedFriendsResponse = z.infer<typeof SuggestedFriendsResponse>;

// ---------- POST /friends/contacts/match ----------
// Server never sees raw phone numbers (per route table).

export const ContactsMatchBody = z.object({
  phoneHashes: z.array(z.string()).min(1).max(2000),
});
export type ContactsMatchBody = z.infer<typeof ContactsMatchBody>;

export const ContactsMatchResponse = z.object({
  matches: z.array(
    zFriendSummary.extend({
      // Echoed back so the client knows which contact this matched.
      phoneHash: z.string(),
    }),
  ),
});
export type ContactsMatchResponse = z.infer<typeof ContactsMatchResponse>;

// ---------- POST /friends/requests ----------

export const SendFriendRequestBody = z.object({
  toUserId: z.string(),
});
export type SendFriendRequestBody = z.infer<typeof SendFriendRequestBody>;

export const SendFriendRequestResponse = zFriendRequest;
export type SendFriendRequestResponse = z.infer<typeof SendFriendRequestResponse>;

// ---------- GET /friends/requests ----------

export const zFriendRequestWithUser = zFriendRequest.extend({
  user: zFriendSummary, // counterparty's public fields
});
export type FriendRequestWithUser = z.infer<typeof zFriendRequestWithUser>;

export const ListFriendRequestsResponse = z.object({
  inbound: z.array(zFriendRequestWithUser),
  outbound: z.array(zFriendRequestWithUser),
});
export type ListFriendRequestsResponse = z.infer<typeof ListFriendRequestsResponse>;

// ---------- POST /friends/requests/{fromUserId}/accept ----------

export const AcceptFriendRequestResponse = z.object({
  friend: zFriendSummary,
});
export type AcceptFriendRequestResponse = z.infer<
  typeof AcceptFriendRequestResponse
>;

// ---------- POST /friends/requests/{fromUserId}/decline ----------
export { EmptyResponse as DeclineFriendRequestResponse } from './shared.js';

// ---------- DELETE /friends/requests/{toUserId} ----------
// Cancel an outbound request.
export { EmptyResponse as CancelFriendRequestResponse } from './shared.js';

// ---------- DELETE /friends/{userId} ----------
// Unfriend.
export { EmptyResponse as UnfriendResponse } from './shared.js';
