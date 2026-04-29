// Stella HTTP service entry point — long-lived Node process on Render.
//
// Was: an AWS Lambda streamifyResponse handler.
// Is:  a Fastify server that hosts the SSE route at
//      POST /stella/conversations/:convoId/messages and a /health probe.
//
// The agent loop, system prompt, tool definitions, MockProvider, and cost
// tracker are unchanged — only the transport and persistence layers moved.

import { buildServer } from './server';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const port = Number(process.env.PORT ?? 8080);
  const app = await buildServer(cfg);
  const url = await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ url }, 'stylist listening');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('stylist failed to start', err);
  process.exit(1);
});
