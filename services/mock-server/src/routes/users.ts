// SPEC.md §7.2 "Public profile".

import type {
  FastifyInstance,
  FastifyPluginAsync,
} from 'fastify';
import { z } from 'zod';
import {
  GetPublicProfileResponse,
  ListUserOotdsQuery,
  ListUserOotdsResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/users/:userId',
    withSchema(
      { params: z.object({ userId: z.string() }) },
      async (request, reply) => {
        const me = requireUserId(request);
        const { userId } = request.params as { userId: string };
        const user = store.users.get(userId);
        if (!user) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        const isFriend = store.areFriends(me, userId);
        // 404 if not discoverable and not a friend (per route comment).
        if (!user.discoverable && !isFriend && me !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        const hasOutgoingRequest = store.friendRequests.some(
          (r) => r.fromUserId === me && r.toUserId === userId && r.status === 'PENDING',
        );
        const hasIncomingRequest = store.friendRequests.some(
          (r) => r.fromUserId === userId && r.toUserId === me && r.status === 'PENDING',
        );
        const profile: {
          userId: string;
          username: string;
          displayName: string;
          avatarUrl?: string;
          city?: string;
          countryCode?: string;
          stylePreferences: string[];
          isFriend: boolean;
          hasOutgoingRequest: boolean;
          hasIncomingRequest: boolean;
        } = {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          stylePreferences: user.stylePreferences,
          isFriend,
          hasOutgoingRequest,
          hasIncomingRequest,
        };
        if (user.avatarUrl) profile.avatarUrl = user.avatarUrl;
        if (user.city) profile.city = user.city;
        if (user.countryCode) profile.countryCode = user.countryCode;
        return validateResponse(request, GetPublicProfileResponse, profile);
      },
    ),
  );

  app.get(
    '/users/:userId/ootds',
    withSchema(
      {
        params: z.object({ userId: z.string() }),
        query: ListUserOotdsQuery,
      },
      async (request, reply) => {
        const me = requireUserId(request);
        const { userId } = request.params as { userId: string };
        const user = store.users.get(userId);
        if (!user) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        const isFriend = store.areFriends(me, userId);
        const ootds = store
          .ootdsForUser(userId)
          .filter(
            (o) =>
              o.visibility === 'PUBLIC' ||
              (o.visibility === 'FRIENDS' && (isFriend || me === userId)),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const q = request.query as z.infer<typeof ListUserOotdsQuery>;
        const page = paginate(ootds, q.cursor, q.limit);
        return validateResponse(request, ListUserOotdsResponse, page);
      },
    ),
  );
};

export default userRoutes;
