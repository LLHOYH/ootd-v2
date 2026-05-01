// Fastify app factory for the image-worker service.

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { storageWebhookRoute } from './routes/storageWebhook';
import { getSupabaseAdmin } from './lib/supabase';
import type { ImageWorkerConfig } from './config';

export async function buildServer(cfg: ImageWorkerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: cfg.logLevel ?? process.env.LOG_LEVEL ?? 'info',
    },
    // Accept up to ~50MB request bodies — Supabase database-webhook payloads
    // for large object inserts can be modest, but we want headroom.
    bodyLimit: 50 * 1024 * 1024,
  });

  app.setErrorHandler((err, _req, reply) => {
    const status = err.statusCode ?? 500;
    const code = status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    return reply
      .status(status)
      .send({ error: { code, message: err.message } });
  });

  app.get('/health', async () => ({ ok: true, service: '@mei/image-worker', mode: cfg.mode }));

  const supabase = getSupabaseAdmin(cfg);
  await app.register(storageWebhookRoute, { config: cfg, supabase });

  return app;
}
