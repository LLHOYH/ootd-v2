// notifier entry point — long-running HTTP service that consumes
// NotificationEvents from Postgres triggers (via pg_net) and fans them
// out to Expo Push.

import { buildServer } from './server';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const port = Number(process.env.PORT ?? 8082);
  const app = await buildServer(cfg);
  const url = await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ url, mode: cfg.mode }, 'notifier listening');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('notifier failed to start', err);
  process.exit(1);
});
