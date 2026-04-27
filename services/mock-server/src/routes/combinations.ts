// SPEC.md §7.2 "Combinations".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Combination } from '@mei/types';
import {
  CreateCombinationBody,
  CreateCombinationResponse,
  GetCombinationResponse,
  ListCombinationsQuery,
  ListCombinationsResponse,
  UpdateCombinationBody,
  UpdateCombinationResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const combinationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/closet/combinations',
    withSchema({ query: ListCombinationsQuery }, async (request) => {
      const userId = requireUserId(request);
      const q = request.query as z.infer<typeof ListCombinationsQuery>;
      const combos = store.combinationsForUser(userId);
      const page = paginate(combos, q.cursor, q.limit);
      return validateResponse(request, ListCombinationsResponse, page);
    }),
  );

  app.post(
    '/closet/combinations',
    withSchema({ body: CreateCombinationBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof CreateCombinationBody>;
      // Sanity-check the items belong to the user.
      for (const itemId of body.itemIds) {
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(
            reply,
            400,
            'INVALID_ITEM',
            `Item ${itemId} not found or not owned by user`,
          );
        }
      }
      const comboId = store.nextId('c');
      const combo: Combination = {
        comboId,
        userId,
        name: body.name ?? 'New combination',
        itemIds: body.itemIds,
        occasionTags: body.occasionTags ?? [],
        source: body.source,
        createdAt: new Date().toISOString(),
      };
      store.combinations.set(comboId, combo);
      return validateResponse(request, CreateCombinationResponse, combo);
    }),
  );

  app.get(
    '/closet/combinations/:comboId',
    withSchema(
      { params: z.object({ comboId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { comboId } = request.params as { comboId: string };
        const combo = store.combinations.get(comboId);
        if (!combo || combo.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Combination not found');
        }
        return validateResponse(request, GetCombinationResponse, combo);
      },
    ),
  );

  app.patch(
    '/closet/combinations/:comboId',
    withSchema(
      {
        params: z.object({ comboId: z.string() }),
        body: UpdateCombinationBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { comboId } = request.params as { comboId: string };
        const combo = store.combinations.get(comboId);
        if (!combo || combo.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Combination not found');
        }
        const patch = request.body as z.infer<typeof UpdateCombinationBody>;
        const updated: Combination = { ...combo, ...patch };
        store.combinations.set(comboId, updated);
        return validateResponse(request, UpdateCombinationResponse, updated);
      },
    ),
  );

  app.delete(
    '/closet/combinations/:comboId',
    withSchema(
      { params: z.object({ comboId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { comboId } = request.params as { comboId: string };
        const combo = store.combinations.get(comboId);
        if (!combo || combo.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Combination not found');
        }
        store.combinations.delete(comboId);
        return {};
      },
    ),
  );
};

export default combinationRoutes;
