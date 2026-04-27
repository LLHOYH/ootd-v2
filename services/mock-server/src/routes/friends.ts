// SPEC.md §7.2 "Friends".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { FriendRequest, User } from '@mei/types';
import {
  AcceptFriendRequestResponse,
  ContactsMatchBody,
  ContactsMatchResponse,
  ListFriendRequestsResponse,
  ListFriendsResponse,
  SearchFriendsQuery,
  SearchFriendsResponse,
  SendFriendRequestBody,
  SendFriendRequestResponse,
  SuggestedFriendsResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

function summary(user: User) {
  const out: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    city?: string;
    countryCode?: string;
  } = {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
  };
  if (user.avatarUrl) out.avatarUrl = user.avatarUrl;
  if (user.city) out.city = user.city;
  if (user.countryCode) out.countryCode = user.countryCode;
  return out;
}

const friendRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/friends', async (request) => {
    const userId = requireUserId(request);
    const items = store.friendsOf(userId).map(summary);
    return validateResponse(request, ListFriendsResponse, { items });
  });

  app.get(
    '/friends/search',
    withSchema({ query: SearchFriendsQuery }, async (request) => {
      const userId = requireUserId(request);
      const q = request.query as z.infer<typeof SearchFriendsQuery>;
      const needle = q.q.toLowerCase();
      const items = [...store.users.values()]
        .filter(
          (u) =>
            u.userId !== userId &&
            u.discoverable &&
            (u.username.toLowerCase().includes(needle) ||
              u.displayName.toLowerCase().includes(needle)),
        )
        .map(summary);
      return validateResponse(request, SearchFriendsResponse, { items });
    }),
  );

  app.get('/friends/suggested', async (request) => {
    const userId = requireUserId(request);
    const friendSet = new Set(store.friendsOf(userId).map((u) => u.userId));
    friendSet.add(userId);
    const items = [...store.users.values()]
      .filter((u) => u.discoverable && !friendSet.has(u.userId))
      .slice(0, 8)
      .map((u) => ({
        ...summary(u),
        reason: 'COMMUNITY_LOOK_INTERACTION' as const,
        mutualCount: Math.floor(Math.random() * 4),
      }));
    return validateResponse(request, SuggestedFriendsResponse, { items });
  });

  app.post(
    '/friends/contacts/match',
    withSchema({ body: ContactsMatchBody }, async (request) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof ContactsMatchBody>;
      const matches = body.phoneHashes
        .map((hash) => {
          const id = store.phoneHashIndex.get(hash);
          if (!id || id === userId) return null;
          const user = store.users.get(id);
          if (!user) return null;
          return { ...summary(user), phoneHash: hash };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));
      return validateResponse(request, ContactsMatchResponse, { matches });
    }),
  );

  app.post(
    '/friends/requests',
    withSchema({ body: SendFriendRequestBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof SendFriendRequestBody>;
      if (body.toUserId === userId) {
        return sendError(reply, 400, 'INVALID', 'Cannot friend yourself');
      }
      if (!store.users.has(body.toUserId)) {
        return sendError(reply, 404, 'NOT_FOUND', 'User does not exist');
      }
      const existing = store.friendRequests.find(
        (r) => r.fromUserId === userId && r.toUserId === body.toUserId,
      );
      if (existing) {
        return validateResponse(request, SendFriendRequestResponse, existing);
      }
      const fr: FriendRequest = {
        fromUserId: userId,
        toUserId: body.toUserId,
        createdAt: new Date().toISOString(),
        status: 'PENDING',
      };
      store.friendRequests.push(fr);
      return validateResponse(request, SendFriendRequestResponse, fr);
    }),
  );

  app.get('/friends/requests', async (request) => {
    const userId = requireUserId(request);
    const inbound = store.friendRequests
      .filter((r) => r.toUserId === userId && r.status === 'PENDING')
      .map((r) => {
        const user = store.users.get(r.fromUserId);
        return { ...r, user: summary(user!) };
      });
    const outbound = store.friendRequests
      .filter((r) => r.fromUserId === userId && r.status === 'PENDING')
      .map((r) => {
        const user = store.users.get(r.toUserId);
        return { ...r, user: summary(user!) };
      });
    return validateResponse(request, ListFriendRequestsResponse, {
      inbound,
      outbound,
    });
  });

  app.post(
    '/friends/requests/:fromUserId/accept',
    withSchema(
      { params: z.object({ fromUserId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { fromUserId } = request.params as { fromUserId: string };
        const idx = store.friendRequests.findIndex(
          (r) =>
            r.fromUserId === fromUserId &&
            r.toUserId === userId &&
            r.status === 'PENDING',
        );
        if (idx < 0) return sendError(reply, 404, 'NOT_FOUND', 'Request not found');
        store.friendRequests[idx] = { ...store.friendRequests[idx]!, status: 'ACCEPTED' };
        store.friendships.push({
          userIdA: fromUserId,
          userIdB: userId,
          createdAt: new Date().toISOString(),
        });
        const user = store.users.get(fromUserId);
        return validateResponse(request, AcceptFriendRequestResponse, {
          friend: summary(user!),
        });
      },
    ),
  );

  app.post(
    '/friends/requests/:fromUserId/decline',
    withSchema(
      { params: z.object({ fromUserId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { fromUserId } = request.params as { fromUserId: string };
        const idx = store.friendRequests.findIndex(
          (r) =>
            r.fromUserId === fromUserId &&
            r.toUserId === userId &&
            r.status === 'PENDING',
        );
        if (idx < 0) return sendError(reply, 404, 'NOT_FOUND', 'Request not found');
        store.friendRequests[idx] = { ...store.friendRequests[idx]!, status: 'DECLINED' };
        return {};
      },
    ),
  );

  app.delete(
    '/friends/requests/:toUserId',
    withSchema(
      { params: z.object({ toUserId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { toUserId } = request.params as { toUserId: string };
        const idx = store.friendRequests.findIndex(
          (r) =>
            r.fromUserId === userId &&
            r.toUserId === toUserId &&
            r.status === 'PENDING',
        );
        if (idx < 0) return sendError(reply, 404, 'NOT_FOUND', 'Request not found');
        store.friendRequests[idx] = { ...store.friendRequests[idx]!, status: 'CANCELLED' };
        return {};
      },
    ),
  );

  app.delete(
    '/friends/:userId',
    withSchema(
      { params: z.object({ userId: z.string() }) },
      async (request, reply) => {
        const me = requireUserId(request);
        const { userId } = request.params as { userId: string };
        const before = store.friendships.length;
        store.friendships = store.friendships.filter(
          (f) =>
            !(
              (f.userIdA === me && f.userIdB === userId) ||
              (f.userIdA === userId && f.userIdB === me)
            ),
        );
        if (store.friendships.length === before) {
          return sendError(reply, 404, 'NOT_FOUND', 'Not friends');
        }
        return {};
      },
    ),
  );
};

export default friendRoutes;
