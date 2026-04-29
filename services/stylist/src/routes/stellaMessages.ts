// POST /stella/conversations/:convoId/messages
//
// Body: { text: string }
// Auth: Bearer <Supabase access token>
// Streams `StellaSseEvent` items as `text/event-stream` until message_stop,
// then writes a terminal `data: [DONE]\n\n` per common SSE convention.
//
// We use Fastify's `reply.raw` (the underlying Node response) to write SSE
// frames directly — Fastify doesn't natively serialize streaming bodies and
// the async generator from `runStella` already gives us natural backpressure.

import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import type { StellaSseEvent } from '@mei/types';

import type { StylistConfig } from '../config';
import { requireBearer } from '../lib/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import { ConversationStore } from '../store/conversationStore';
import { getProvider } from '../llm/factory';
import { runStella } from '../agent/runStella';
import type { ToolContext } from '../agent/toolHandlers';

interface RouteOptions {
  config: StylistConfig;
}

interface MessageBody {
  text?: unknown;
}

interface MessageParams {
  convoId: string;
}

function frameSseEvent(ev: StellaSseEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

export const stellaMessagesRoute: FastifyPluginAsync<RouteOptions> = async (
  app: FastifyInstance,
  opts: RouteOptions,
) => {
  const cfg = opts.config;

  app.post<{ Body: MessageBody; Params: MessageParams }>(
    '/stella/conversations/:convoId/messages',
    async (req: FastifyRequest<{ Body: MessageBody; Params: MessageParams }>, reply: FastifyReply) => {
      // Auth first — failures here should produce a JSON error envelope, not
      // a half-open SSE stream. requireBearer throws AuthError → caught by
      // the global error handler in server.ts.
      const { userId } = await requireBearer(req, cfg);

      const convoId = req.params.convoId;
      if (!convoId) {
        reply.status(400);
        throw new Error('convoId path param is required');
      }
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      if (!text) {
        reply.status(400);
        throw new Error('Body must include `text: string`');
      }

      // Switch the response into SSE mode. Once we've written headers we own
      // the socket — no further Fastify lifecycle hooks fire on this reply.
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });

      const supabase = getSupabaseAdmin(cfg);
      const store = new ConversationStore(supabase);
      const provider = getProvider(cfg);
      const toolCtx: ToolContext = {
        userId,
        convoId,
        supabase,
      };

      try {
        for await (const ev of runStella({
          userId,
          convoId,
          userText: text,
          provider,
          store,
          toolCtx,
        })) {
          reply.raw.write(frameSseEvent(ev));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        req.log.error({ err }, 'runStella failed');
        reply.raw.write(
          frameSseEvent({
            event: 'error',
            code: 'internal_error',
            message,
          }),
        );
      } finally {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      }
    },
  );
};
