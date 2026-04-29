// Fastify app factory for the Stella service.
//
// Split out from `src/index.ts` so future tests can spin up the app without
// the listener side-effect. The factory is async because route registration
// is async — we can't return until plugins are wired.

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { stellaMessagesRoute } from './routes/stellaMessages';
import { AuthError } from './lib/auth';
import type { StylistConfig } from './config';

export async function buildServer(
  cfg: StylistConfig,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: cfg.logLevel ?? process.env.LOG_LEVEL ?? 'info' },
  });

  // Single error envelope per SPEC §7.1: `{ error: { code, message } }`.
  // Fastify's default handler returns `{ statusCode, error, message }` —
  // we override so every endpoint shares the same shape.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AuthError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message } });
    }
    const status = err.statusCode ?? 500;
    const code = status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    return reply
      .status(status)
      .send({ error: { code, message: err.message } });
  });

  app.get('/health', async () => ({ ok: true, service: '@mei/stylist' }));

  await app.register(stellaMessagesRoute, { config: cfg });

  return app;
}
