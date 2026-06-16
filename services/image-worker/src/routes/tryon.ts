// POST /tryon
//
// Called by the api Lambda after it creates a `tryon_generations` row.
// Synchronous in v1: blocks while we call the Replicate try-on provider,
// then returns the terminal state of the row (READY or FAILED). The
// caller surfaces that back to the mobile screen.
//
// Body shape:
//   { generationId, userId, selfieId, itemId, preferModelPhoto? }
//
// All four ids are required. We do NOT re-validate user ownership here —
// the api Lambda already RLS-checked it. This route is server-to-server.
// `IMAGE_WORKER_WEBHOOK_SECRET` (same secret the storage webhook uses)
// gates the route when set.

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageWorkerConfig } from '../config';
import { generateTryon } from '../pipeline/generateTryon';

interface RouteOptions {
  config: ImageWorkerConfig;
  supabase: SupabaseClient;
}

interface TryonBody {
  generationId: string;
  userId: string;
  selfieId: string;
  itemId: string;
  preferModelPhoto?: boolean;
}

export const tryonRoute: FastifyPluginAsync<RouteOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  app.post(
    '/tryon',
    async (req: FastifyRequest<{ Body: TryonBody }>, reply) => {
      // Webhook secret check (same shape as storageWebhook).
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
        typeof body.generationId !== 'string' ||
        typeof body.userId !== 'string' ||
        typeof body.selfieId !== 'string' ||
        typeof body.itemId !== 'string'
      ) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'missing generationId/userId/selfieId/itemId' },
        });
      }

      const result = await generateTryon(
        opts.config,
        opts.supabase,
        {
          ...body,
          preferModelPhoto: body.preferModelPhoto === true,
        },
        {
          info: (m, c) => app.log.info(c ?? {}, m),
          warn: (m, c) => app.log.warn(c ?? {}, m),
          error: (m, c) => app.log.error(c ?? {}, m),
        },
      );

      if (result.status === 'failed') {
        // 200 with FAILED status so the api caller can read the detail
        // out of the body without paying a fetch-retry tax. The detail
        // is the same string we wrote to error_detail on the row.
        return reply.status(200).send({
          generationId: result.generationId,
          status: 'FAILED',
          detail: result.detail ?? 'unknown failure',
        });
      }

      return reply.status(200).send({
        generationId: result.generationId,
        status: 'READY',
        generatedStorageKey: result.generatedStorageKey,
        providerId: result.providerId,
      });
    },
  );
};
