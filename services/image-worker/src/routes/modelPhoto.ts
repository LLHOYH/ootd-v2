// POST /model-photo
//
// Called by the api Lambda after it creates a `model_photos` row.

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageWorkerConfig } from '../config';
import { generateModelPhoto } from '../pipeline/generateModelPhoto';

interface RouteOptions {
  config: ImageWorkerConfig;
  supabase: SupabaseClient;
}

interface ModelPhotoBody {
  modelPhotoId: string;
  userId: string;
}

export const modelPhotoRoute: FastifyPluginAsync<RouteOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  app.post(
    '/model-photo',
    async (req: FastifyRequest<{ Body: ModelPhotoBody }>, reply) => {
      const expected = opts.config.webhookSecret;
      if (expected) {
        const got = req.headers['x-webhook-secret'];
        if (got !== expected) {
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'invalid webhook secret' },
          });
        }
      }

      const body = req.body;
      if (
        !body ||
        typeof body.modelPhotoId !== 'string' ||
        typeof body.userId !== 'string'
      ) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'missing modelPhotoId/userId' },
        });
      }

      const result = await generateModelPhoto(
        opts.config,
        opts.supabase,
        body,
        {
          info: (m, c) => app.log.info(c ?? {}, m),
          warn: (m, c) => app.log.warn(c ?? {}, m),
          error: (m, c) => app.log.error(c ?? {}, m),
        },
      );

      if (result.status === 'failed') {
        return reply.status(200).send({
          modelPhotoId: result.modelPhotoId,
          status: 'FAILED',
          detail: result.detail ?? 'unknown failure',
        });
      }

      return reply.status(200).send({
        modelPhotoId: result.modelPhotoId,
        status: 'READY',
        storageKey: result.storageKey,
        providerId: result.providerId,
      });
    },
  );
};
