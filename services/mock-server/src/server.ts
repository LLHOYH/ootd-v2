// Builds a Fastify instance with all middleware + routes wired up.
// `index.ts` calls this to start the server; tests can call it for in-process
// requests without binding a port.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

import { corsOptions } from './middleware/cors.js';
import { registerRequestId } from './middleware/requestId.js';
import { authPreHandler } from './util/auth.js';
import { ApiError, errorBody } from './util/errors.js';

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import selfieRoutes from './routes/selfies.js';
import closetRoutes from './routes/closet.js';
import combinationRoutes from './routes/combinations.js';
import todayRoutes from './routes/today.js';
import ootdRoutes from './routes/ootd.js';
import hangoutRoutes from './routes/hangouts.js';
import friendRoutes from './routes/friends.js';
import userRoutes from './routes/users.js';
import stellaRoutes from './routes/stella.js';
import chatRoutes from './routes/chat.js';
import { seed } from './fixtures/seed.js';
import { store } from './fixtures/index.js';

export interface BuildServerOptions {
  /** Defaults to true. Tests pass `false` to control state explicitly. */
  seed?: boolean;
  /** Pino log level. Defaults to 'info'. */
  logLevel?: string;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: options.logLevel ?? 'info' },
    // Generate our own ids in the requestId middleware so we can echo them.
    genReqId: () => '',
    disableRequestLogging: true, // we log in onResponse instead
  });

  await app.register(cors, corsOptions);
  await app.register(sensible);
  registerRequestId(app);

  app.addHook('preHandler', authPreHandler);

  // Translate ApiError + unknown errors into the SPEC §7.1 envelope.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message));
    }
    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send(errorBody('INTERNAL', err.message ?? 'Internal Server Error'));
  });

  app.get('/health', async () => ({
    ok: true,
    name: '@mei/mock-server',
    seededUser: 'u_sophia',
    counts: {
      users: store.users.size,
      items: store.items.size,
      combinations: store.combinations.size,
      ootds: store.ootds.size,
      threads: store.threads.size,
    },
  }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(selfieRoutes);
  await app.register(closetRoutes);
  await app.register(combinationRoutes);
  await app.register(todayRoutes);
  await app.register(ootdRoutes);
  await app.register(hangoutRoutes);
  await app.register(friendRoutes);
  await app.register(userRoutes);
  await app.register(stellaRoutes);
  await app.register(chatRoutes);

  if (options.seed !== false) {
    seed(store);
  }

  return app;
}
