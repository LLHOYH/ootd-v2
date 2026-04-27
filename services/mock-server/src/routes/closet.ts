// SPEC.md §7.2 "Closet".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ClosetItem } from '@mei/types';
import {
  ConfirmItemResponse,
  GetItemResponse,
  ListItemsQuery,
  ListItemsResponse,
  PendingReviewResponse,
  ProcessItemResponse,
  UpdateItemBody,
  UpdateItemResponse,
  UploadItemsBody,
  UploadItemsResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const PHOTO = 'https://placehold.co/600x900/F2EAD9/3D4856?text=Mei';
const THUMB = 'https://placehold.co/300x450/F2EAD9/3D4856?text=Mei';

const closetRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /closet/items/upload — issue N fake presigned URLs and create stub items.
  app.post(
    '/closet/items/upload',
    withSchema({ body: UploadItemsBody }, async (request) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof UploadItemsBody>;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const items = Array.from({ length: body.count }, () => {
        const itemId = store.nextId('i');
        const stub: ClosetItem = {
          itemId,
          userId,
          category: 'TOP',
          name: 'Uploading…',
          description: '',
          colors: [],
          occasionTags: [],
          weatherTags: [],
          rawPhotoUrl: '',
          tunedPhotoUrl: '',
          thumbnailUrl: '',
          status: 'PROCESSING',
          createdAt: now,
          updatedAt: now,
        };
        store.items.set(itemId, stub);
        store.pendingItemIds.add(itemId);
        return {
          itemId,
          uploadUrl: `https://mock-mei-s3.local/upload/${userId}/${itemId}?sig=mock`,
          expiresAt,
        };
      });
      return validateResponse(request, UploadItemsResponse, { items });
    }),
  );

  // POST /closet/items/{itemId}/process — mark as READY (idempotent).
  app.post(
    '/closet/items/:itemId/process',
    withSchema(
      { params: z.object({ itemId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { itemId } = request.params as { itemId: string };
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Item not found');
        }
        const updated: ClosetItem = {
          ...item,
          status: 'READY',
          rawPhotoUrl: PHOTO,
          tunedPhotoUrl: PHOTO,
          thumbnailUrl: THUMB,
          name: item.name === 'Uploading…' ? 'New piece' : item.name,
          description:
            item.description ||
            'Auto-generated description — soft tones, easy fit.',
          updatedAt: new Date().toISOString(),
        };
        store.items.set(itemId, updated);
        return validateResponse(request, ProcessItemResponse, {
          itemId,
          status: updated.status,
        });
      },
    ),
  );

  // GET /closet/items
  app.get(
    '/closet/items',
    withSchema({ query: ListItemsQuery }, async (request) => {
      const userId = requireUserId(request);
      const q = request.query as z.infer<typeof ListItemsQuery>;
      let items = store.itemsForUser(userId);
      if (q.category) items = items.filter((i) => i.category === q.category);
      if (q.status) items = items.filter((i) => i.status === q.status);
      const page = paginate(items, q.cursor, q.limit);
      return validateResponse(request, ListItemsResponse, page);
    }),
  );

  // GET /closet/items/pending-review (must be registered before :itemId routes
  // — Fastify uses a radix tree so order doesn't strictly matter, but listing
  // it first reads more clearly).
  app.get('/closet/items/pending-review', async (request) => {
    const userId = requireUserId(request);
    const items = store
      .itemsForUser(userId)
      .filter((i) => store.pendingItemIds.has(i.itemId));
    return validateResponse(request, PendingReviewResponse, { items });
  });

  // GET /closet/items/{itemId}
  app.get(
    '/closet/items/:itemId',
    withSchema(
      { params: z.object({ itemId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { itemId } = request.params as { itemId: string };
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Item not found');
        }
        return validateResponse(request, GetItemResponse, item);
      },
    ),
  );

  // PATCH /closet/items/{itemId}
  app.patch(
    '/closet/items/:itemId',
    withSchema(
      {
        params: z.object({ itemId: z.string() }),
        body: UpdateItemBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { itemId } = request.params as { itemId: string };
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Item not found');
        }
        const patch = request.body as z.infer<typeof UpdateItemBody>;
        const updated: ClosetItem = {
          ...item,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        store.items.set(itemId, updated);
        return validateResponse(request, UpdateItemResponse, updated);
      },
    ),
  );

  // DELETE /closet/items/{itemId}
  app.delete(
    '/closet/items/:itemId',
    withSchema(
      { params: z.object({ itemId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { itemId } = request.params as { itemId: string };
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Item not found');
        }
        store.items.delete(itemId);
        store.pendingItemIds.delete(itemId);
        return {};
      },
    ),
  );

  // POST /closet/items/{itemId}/confirm
  app.post(
    '/closet/items/:itemId/confirm',
    withSchema(
      { params: z.object({ itemId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { itemId } = request.params as { itemId: string };
        const item = store.items.get(itemId);
        if (!item || item.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Item not found');
        }
        store.pendingItemIds.delete(itemId);
        return validateResponse(request, ConfirmItemResponse, item);
      },
    ),
  );
};

export default closetRoutes;
