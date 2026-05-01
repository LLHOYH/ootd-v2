// Fastify app factory for the notifier service.

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { notifyRoute } from './routes/notify';
import { getSupabaseAdmin } from './lib/supabase';
import type { NotifierConfig } from './config';

export async function buildServer(cfg: NotifierConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: cfg.logLevel ?? process.env.LOG_LEVEL ?? 'info',
    },
  });

  app.setErrorHandler((err, _req, reply) => {
    const status = err.statusCode ?? 500;
    const code = status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    return reply
      .status(status)
      .send({ error: { code, message: err.message } });
  });

  app.get('/health', async () => ({ ok: true, service: '@mei/notifier', mode: cfg.mode }));

  const supabase = getSupabaseAdmin(cfg);
  await app.register(notifyRoute, { config: cfg, supabase });

  return app;
}
