// image-worker entry point — long-running HTTP service that consumes
// Supabase Storage / pg_net database-webhook events for closet uploads
// and promotes the rows from PROCESSING → READY (SPEC §9.1).
//
// Designed to run as a Lambda behind API Gateway (production) OR as a
// long-lived process (local dev + the optional always-on Render deploy).
// The Fastify factory in src/server.ts is the same in both cases; this
// file is the listener side-effect only.

import { buildServer } from './server';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const port = Number(process.env.PORT ?? 8090);
  const app = await buildServer(cfg);
  const url = await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ url, mode: cfg.mode }, 'image-worker listening');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('image-worker failed to start', err);
  process.exit(1);
});
