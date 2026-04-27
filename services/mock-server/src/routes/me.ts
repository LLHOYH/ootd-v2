// SPEC.md §7.2 "Auth & profile" — /me endpoints.

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GetMeResponse, UpdateMeBody, UpdateMeResponse } from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

const meRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/me', async (request, reply) => {
    const userId = requireUserId(request);
    const user = store.users.get(userId);
    if (!user) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
    return validateResponse(request, GetMeResponse, user);
  });

  app.patch(
    '/me',
    withSchema({ body: UpdateMeBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const user = store.users.get(userId);
      if (!user) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      const patch = request.body as z.infer<typeof UpdateMeBody>;
      const updated = { ...user, ...patch, lastActiveAt: new Date().toISOString() };
      store.users.set(userId, updated);
      return validateResponse(request, UpdateMeResponse, updated);
    }),
  );

  app.delete('/me', async (request, reply) => {
    const userId = requireUserId(request);
    if (!store.users.has(userId)) {
      return sendError(reply, 404, 'NOT_FOUND', 'User not found');
    }
    store.users.delete(userId);
    // Cascade — drop everything owned by this user.
    for (const [k, v] of store.items) if (v.userId === userId) store.items.delete(k);
    for (const [k, v] of store.combinations) if (v.userId === userId) store.combinations.delete(k);
    for (const [k, v] of store.ootds) if (v.userId === userId) store.ootds.delete(k);
    for (const [k, v] of store.selfies) if (v.userId === userId) store.selfies.delete(k);
    return reply.status(200).send({});
  });
};

export default meRoutes;
