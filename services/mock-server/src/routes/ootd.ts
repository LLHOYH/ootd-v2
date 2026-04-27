// SPEC.md §7.2 "OOTD".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OOTDPost } from '@mei/types';
import {
  CoordinateOotdResponse,
  CreateOotdBody,
  CreateOotdResponse,
  GetOotdResponse,
  OotdFeedQuery,
  OotdFeedResponse,
  ReactOotdBody,
  ReactOotdResponse,
  UnreactOotdResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const PHOTO = 'https://placehold.co/600x900/F2EAD9/3D4856?text=Mei';

const ootdRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/ootd',
    withSchema({ body: CreateOotdBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof CreateOotdBody>;
      const combo = store.combinations.get(body.comboId);
      if (!combo || combo.userId !== userId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Combination not found');
      }
      const ootdId = store.nextId('o');
      const ootd: OOTDPost = {
        ootdId,
        userId,
        comboId: body.comboId,
        ...(body.caption !== undefined && { caption: body.caption }),
        ...(body.locationName !== undefined && { locationName: body.locationName }),
        // try-on photo "generates async" — for the mock we hand back a
        // ready URL so the demo is single-step.
        tryOnPhotoUrl: PHOTO,
        fallbackOutfitCardUrl: PHOTO,
        visibility: body.visibility,
        ...(body.visibilityTargets && { visibilityTargets: body.visibilityTargets }),
        reactions: [],
        createdAt: new Date().toISOString(),
      };
      store.ootds.set(ootdId, ootd);
      return validateResponse(request, CreateOotdResponse, {
        ootdId,
        status: 'READY',
      });
    }),
  );

  app.get(
    '/ootd/feed',
    withSchema({ query: OotdFeedQuery }, async (request) => {
      const userId = requireUserId(request);
      const q = request.query as z.infer<typeof OotdFeedQuery>;
      const friendIds = new Set(store.friendsOf(userId).map((u) => u.userId));
      friendIds.add(userId);
      const feed = [...store.ootds.values()]
        .filter((o) => friendIds.has(o.userId) || o.visibility === 'PUBLIC')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(feed, q.cursor, q.limit);
      return validateResponse(request, OotdFeedResponse, page);
    }),
  );

  app.get(
    '/ootd/:ootdId',
    withSchema(
      { params: z.object({ ootdId: z.string() }) },
      async (request, reply) => {
        const { ootdId } = request.params as { ootdId: string };
        const ootd = store.ootds.get(ootdId);
        if (!ootd) return sendError(reply, 404, 'NOT_FOUND', 'OOTD not found');
        return validateResponse(request, GetOotdResponse, ootd);
      },
    ),
  );

  app.delete(
    '/ootd/:ootdId',
    withSchema(
      { params: z.object({ ootdId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { ootdId } = request.params as { ootdId: string };
        const ootd = store.ootds.get(ootdId);
        if (!ootd) return sendError(reply, 404, 'NOT_FOUND', 'OOTD not found');
        if (ootd.userId !== userId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Not your OOTD');
        }
        store.ootds.delete(ootdId);
        return {};
      },
    ),
  );

  app.post(
    '/ootd/:ootdId/react',
    withSchema(
      {
        params: z.object({ ootdId: z.string() }),
        body: ReactOotdBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { ootdId } = request.params as { ootdId: string };
        const ootd = store.ootds.get(ootdId);
        if (!ootd) return sendError(reply, 404, 'NOT_FOUND', 'OOTD not found');
        if (!ootd.reactions.some((r) => r.userId === userId)) {
          ootd.reactions.push({ userId, type: '♡' });
        }
        return validateResponse(request, ReactOotdResponse, {
          ootdId,
          reactionCount: ootd.reactions.length,
        });
      },
    ),
  );

  app.delete(
    '/ootd/:ootdId/react',
    withSchema(
      { params: z.object({ ootdId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { ootdId } = request.params as { ootdId: string };
        const ootd = store.ootds.get(ootdId);
        if (!ootd) return sendError(reply, 404, 'NOT_FOUND', 'OOTD not found');
        ootd.reactions = ootd.reactions.filter((r) => r.userId !== userId);
        return validateResponse(request, UnreactOotdResponse, {
          ootdId,
          reactionCount: ootd.reactions.length,
        });
      },
    ),
  );

  app.post(
    '/ootd/:ootdId/coordinate',
    withSchema(
      { params: z.object({ ootdId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { ootdId } = request.params as { ootdId: string };
        const ootd = store.ootds.get(ootdId);
        if (!ootd) return sendError(reply, 404, 'NOT_FOUND', 'OOTD not found');
        // Pick any of caller's combinations as the "coordinated" suggestion.
        const myCombos = store.combinationsForUser(userId);
        const suggestion = myCombos[0];
        if (!suggestion) {
          return sendError(
            reply,
            409,
            'NO_COMBINATIONS',
            'You have no combinations to coordinate from',
          );
        }
        return validateResponse(request, CoordinateOotdResponse, {
          suggestion,
          rationale: 'matches the soft palette and warm-weather feel of their look ✦',
        });
      },
    ),
  );
};

export default ootdRoutes;
