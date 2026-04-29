// Friends + Public profile endpoints — see SPEC §7.2 and §10.12 / §10.15.
//
// 12 routes total:
//   - 8 friends mutation/query endpoints under /friends/*
//   - 2 friend-request lifecycle endpoints under /friends/requests/*
//   - 2 public-profile endpoints under /users/:userId(/ootds)?
//
// The /users/* routes belong to this domain because "view another user's
// public profile" is conceptually part of the friend-finder flow — the
// alternative was a separate users/ domain that owned only two routes
// and shared every helper with this one.
//
// Route ordering matters: the router (services/api/src/router.ts) does
// first-match-wins. Static segments MUST come before dynamic ones for
// both the `/friends/...` group and the `/users/...` group:
//
//   /friends/requests           ← static
//   /friends/search             ← static
//   /friends/suggested          ← static
//   /friends/contacts/match     ← static
//   /friends/requests/:id/...   ← static-prefixed dynamic
//   /friends/:userId            ← bare dynamic, registered LAST
//
//   /users/:userId/ootds        ← deeper path, registered first
//   /users/:userId              ← bare dynamic, registered LAST
//
// Handler composition mirrors the rest of the codebase:
// `requireAuth(attachSupabaseClient(handler))`. The dispatcher in
// services/api/src/index.ts re-wraps `attachSupabaseClient` as a safety
// net (idempotent) so the explicit wrap here is redundant-but-pattern-
// consistent.

import type { Handler } from '../../context';
import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';

import { listFriendsHandler } from './listFriends';
import { searchHandler } from './search';
import { suggestedHandler } from './suggested';
import { contactsMatchHandler } from './contactsMatch';
import { sendRequestHandler } from './sendRequest';
import { listRequestsHandler } from './listRequests';
import { acceptRequestHandler } from './acceptRequest';
import { declineRequestHandler } from './declineRequest';
import { cancelRequestHandler } from './cancelRequest';
import { unfriendHandler } from './unfriend';
import { getPublicProfileHandler } from './getPublicProfile';
import { listUserOotdsHandler } from './listUserOotds';

const wrap = (h: Handler): Handler => requireAuth(attachSupabaseClient(h));

export const friendsRoutes: RouteDef[] = [
  // ---------- /friends/* — static segments first ----------
  {
    method: 'GET',
    path: '/friends',
    handler: wrap(listFriendsHandler),
  },
  {
    method: 'GET',
    path: '/friends/search',
    handler: wrap(searchHandler),
  },
  {
    method: 'GET',
    path: '/friends/suggested',
    handler: wrap(suggestedHandler),
  },
  {
    method: 'POST',
    path: '/friends/contacts/match',
    handler: wrap(contactsMatchHandler),
  },

  // ---------- /friends/requests/* ----------
  // `/friends/requests` (static) and `/friends/requests/:id/...` (dynamic
  // child) both come before `/friends/:userId` so the bare-dynamic
  // segment doesn't swallow a request to one of these.
  {
    method: 'POST',
    path: '/friends/requests',
    handler: wrap(sendRequestHandler),
  },
  {
    method: 'GET',
    path: '/friends/requests',
    handler: wrap(listRequestsHandler),
  },
  {
    method: 'POST',
    path: '/friends/requests/:fromUserId/accept',
    handler: wrap(acceptRequestHandler),
  },
  {
    method: 'POST',
    path: '/friends/requests/:fromUserId/decline',
    handler: wrap(declineRequestHandler),
  },
  {
    method: 'DELETE',
    path: '/friends/requests/:toUserId',
    handler: wrap(cancelRequestHandler),
  },

  // ---------- /friends/:userId — bare dynamic, registered LAST ----------
  {
    method: 'DELETE',
    path: '/friends/:userId',
    handler: wrap(unfriendHandler),
  },

  // ---------- /users/* — deeper path first ----------
  {
    method: 'GET',
    path: '/users/:userId/ootds',
    handler: wrap(listUserOotdsHandler),
  },
  {
    method: 'GET',
    path: '/users/:userId',
    handler: wrap(getPublicProfileHandler),
  },
];
