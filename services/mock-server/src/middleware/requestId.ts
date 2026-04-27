// Assigns/echoes `x-request-id`, logs request → response with timing.

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();
    request.id = id;
    reply.header('x-request-id', id);
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'request completed',
    );
  });
}
