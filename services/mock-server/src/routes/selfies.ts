// SPEC.md §7.2 "Selfies".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CreateSelfieBody,
  CreateSelfieResponse,
  ListSelfiesResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

const selfieRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/me/selfies',
    withSchema({ body: CreateSelfieBody }, async (request) => {
      const userId = requireUserId(request);
      const selfieId = store.nextId('sf');
      const s3Key = `selfies/${userId}/${selfieId}.jpg`;
      store.selfies.set(selfieId, {
        selfieId,
        userId,
        s3Key,
        uploadedAt: new Date().toISOString(),
      });
      return validateResponse(request, CreateSelfieResponse, {
        selfieId,
        // Fake presigned URL — caller never actually PUTs to it.
        uploadUrl: `https://mock-mei-s3.local/upload/${s3Key}?sig=mock`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    }),
  );

  app.get('/me/selfies', async (request) => {
    const userId = requireUserId(request);
    return validateResponse(request, ListSelfiesResponse, {
      items: store.selfiesForUser(userId),
    });
  });

  app.delete(
    '/me/selfies/:selfieId',
    withSchema(
      { params: z.object({ selfieId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { selfieId } = request.params as { selfieId: string };
        const selfie = store.selfies.get(selfieId);
        if (!selfie || selfie.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Selfie not found');
        }
        store.selfies.delete(selfieId);
        return {};
      },
    ),
  );
};

export default selfieRoutes;
