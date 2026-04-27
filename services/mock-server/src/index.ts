// Mei mock server — entry point.
// Boots Fastify, listens on PORT (default 4000), logs the URL on start.

import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port, host });
  // listen() already logs, but make the dev URL obvious for the tabbing case.
  app.log.info(
    `Mei mock server ready → http://localhost:${port}  (token convention: \`Bearer mock_<userId>\`, e.g. \`mock_u_sophia\`)`,
  );
}

main().catch((err) => {
  console.error('Failed to start mock server', err);
  process.exit(1);
});
