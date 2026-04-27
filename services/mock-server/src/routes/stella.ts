// SPEC.md §7.2 "Stella" + §7.3 (streaming).
//
// POST /stella/.../messages streams an SSE response with:
//   - message_start
//   - several text_delta events (over ~1s)
//   - one tool_call event carrying an outfit suggestion (the `outfit-suggestion`
//     surface mentioned in the brief — modelled as a tool_call since that's
//     what the StellaSseEvent discriminated union supports)
//   - message_stop

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { StellaConversation, ZStellaMessage, StellaSseEvent } from '@mei/types';
import {
  CreateStellaConversationBody,
  CreateStellaConversationResponse,
  GetStellaConversationResponse,
  ListStellaConversationsResponse,
  SendStellaMessageBody,
  StellaSseEvent as StellaSseEventSchema,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseLine(event: StellaSseEvent): string {
  // Validate against the schema — surfaces drift even on the streaming path.
  StellaSseEventSchema.parse(event);
  return `data: ${JSON.stringify(event)}\n\n`;
}

const stellaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/stella/conversations',
    withSchema({ body: CreateStellaConversationBody }, async (request) => {
      const userId = requireUserId(request);
      const body =
        (request.body as z.infer<typeof CreateStellaConversationBody>) ?? {};
      const convoId = store.nextId('sc');
      const now = new Date().toISOString();
      const conversation: StellaConversation = {
        convoId,
        userId,
        title: body?.title ?? 'New chat',
        createdAt: now,
        lastMessageAt: now,
      };
      store.stellaConversations.set(convoId, conversation);
      store.stellaMessages.set(convoId, []);
      if (body?.seedMessage) {
        const seed: ZStellaMessage = {
          messageId: store.nextId('sm'),
          convoId,
          role: 'USER',
          text: body.seedMessage,
          createdAt: now,
        };
        store.stellaMessages.get(convoId)!.push(seed);
      }
      return validateResponse(request, CreateStellaConversationResponse, {
        convoId,
        conversation,
      });
    }),
  );

  app.get('/stella/conversations', async (request) => {
    const userId = requireUserId(request);
    return validateResponse(request, ListStellaConversationsResponse, {
      items: store.conversationsFor(userId),
    });
  });

  app.get(
    '/stella/conversations/:convoId',
    withSchema(
      { params: z.object({ convoId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { convoId } = request.params as { convoId: string };
        const conversation = store.stellaConversations.get(convoId);
        if (!conversation || conversation.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Conversation not found');
        }
        const messages = store.stellaMessages.get(convoId) ?? [];
        return validateResponse(request, GetStellaConversationResponse, {
          conversation,
          messages,
        });
      },
    ),
  );

  // SSE streaming endpoint.
  app.post(
    '/stella/conversations/:convoId/messages',
    withSchema(
      {
        params: z.object({ convoId: z.string() }),
        body: SendStellaMessageBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { convoId } = request.params as { convoId: string };
        const conversation = store.stellaConversations.get(convoId);
        if (!conversation || conversation.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Conversation not found');
        }
        const body = request.body as z.infer<typeof SendStellaMessageBody>;

        const userMessage: ZStellaMessage = {
          messageId: store.nextId('sm'),
          convoId,
          role: 'USER',
          text: body.text,
          createdAt: new Date().toISOString(),
        };
        store.stellaMessages.get(convoId)!.push(userMessage);

        // SSE — hijack the reply so Fastify doesn't try to serialize it.
        reply.hijack();
        reply.raw.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-request-id': request.id,
        });

        const assistantMessageId = store.nextId('sm');
        const reply_chunks = [
          'pulling ',
          'from your closet — ',
          'linen midi ',
          '+ tan sandals. ',
          'easy for the heat ☼',
        ];

        // Pretend to think for ~1s, dribbling chunks across that window.
        reply.raw.write(
          sseLine({ event: 'message_start', messageId: assistantMessageId }),
        );
        for (const delta of reply_chunks) {
          await sleep(1000 / reply_chunks.length);
          reply.raw.write(sseLine({ event: 'text_delta', delta }));
        }
        // Outfit suggestion arrives as a `tool_call` event — the closest fit
        // for the discriminated union schema. The mobile app reads `name` to
        // route this event into the outfit-suggestion bubble.
        const suggestion = store
          .combinationsForUser(userId)
          .find((c) => c.occasionTags.includes('BRUNCH'));
        if (suggestion) {
          reply.raw.write(
            sseLine({
              event: 'tool_call',
              name: 'outfit_suggestion',
              input: { combination: suggestion },
            }),
          );
        }
        reply.raw.write(
          sseLine({ event: 'message_stop', messageId: assistantMessageId }),
        );
        reply.raw.end();

        const assistantText = reply_chunks.join('');
        const assistantMessage: ZStellaMessage = {
          messageId: assistantMessageId,
          convoId,
          role: 'ASSISTANT',
          text: assistantText,
          createdAt: new Date().toISOString(),
        };
        store.stellaMessages.get(convoId)!.push(assistantMessage);
        const updated: StellaConversation = {
          ...conversation,
          lastMessageAt: assistantMessage.createdAt,
        };
        store.stellaConversations.set(convoId, updated);
      },
    ),
  );

  app.delete(
    '/stella/conversations/:convoId',
    withSchema(
      { params: z.object({ convoId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { convoId } = request.params as { convoId: string };
        const conversation = store.stellaConversations.get(convoId);
        if (!conversation || conversation.userId !== userId) {
          return sendError(reply, 404, 'NOT_FOUND', 'Conversation not found');
        }
        store.stellaConversations.delete(convoId);
        store.stellaMessages.delete(convoId);
        return {};
      },
    ),
  );
};

export default stellaRoutes;
