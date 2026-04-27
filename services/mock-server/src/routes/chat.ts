// SPEC.md §7.2 "Chat".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ChatMessage, ChatThread } from '@mei/types';
import {
  CreateDirectThreadBody,
  CreateDirectThreadResponse,
  GetChatThreadQuery,
  GetChatThreadResponse,
  ListChatThreadsResponse,
  MarkThreadReadBody,
  MarkThreadReadResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const chatRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/chat/threads', async (request) => {
    const userId = requireUserId(request);
    const all = store.threadsFor(userId);
    // Pinned == Stella thread per SPEC §10.6.
    const pinned = all.filter((t) => t.type === 'STELLA');
    const groups = all.filter((t) => t.type === 'GROUP');
    const hangouts = all.filter((t) => t.type === 'HANGOUT');
    const direct = all.filter((t) => t.type === 'DIRECT');
    return validateResponse(request, ListChatThreadsResponse, {
      pinned,
      groups,
      hangouts,
      direct,
    });
  });

  app.get(
    '/chat/threads/:threadId',
    withSchema(
      {
        params: z.object({ threadId: z.string() }),
        query: GetChatThreadQuery,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { threadId } = request.params as { threadId: string };
        const thread = store.threads.get(threadId);
        if (!thread || !thread.participantIds.includes(userId)) {
          return sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
        }
        const all = store.chatMessages.get(threadId) ?? [];
        const sorted = [...all].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        const q = request.query as z.infer<typeof GetChatThreadQuery>;
        const page = paginate(sorted, q.cursor, q.limit);
        return validateResponse(request, GetChatThreadResponse, {
          thread,
          messages: page,
        });
      },
    ),
  );

  app.post(
    '/chat/threads/:threadId/messages',
    withSchema(
      {
        params: z.object({ threadId: z.string() }),
        body: SendChatMessageBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { threadId } = request.params as { threadId: string };
        const thread = store.threads.get(threadId);
        if (!thread || !thread.participantIds.includes(userId)) {
          return sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
        }
        const body = request.body as z.infer<typeof SendChatMessageBody>;
        const message: ChatMessage = {
          messageId: store.nextId('m'),
          threadId,
          senderId: userId,
          kind: body.kind,
          ...(body.text !== undefined && { text: body.text }),
          ...(body.refId !== undefined && { refId: body.refId }),
          createdAt: new Date().toISOString(),
        };
        const arr = store.chatMessages.get(threadId) ?? [];
        arr.push(message);
        store.chatMessages.set(threadId, arr);
        // Update thread lastMessage + bump unread for everyone except sender.
        const preview =
          body.kind === 'TEXT' && body.text
            ? body.text.slice(0, 80)
            : `[${body.kind.toLowerCase()}]`;
        const unreadCounts = { ...thread.unreadCounts };
        for (const pid of thread.participantIds) {
          if (pid === userId) {
            unreadCounts[pid] = 0;
          } else {
            unreadCounts[pid] = (unreadCounts[pid] ?? 0) + 1;
          }
        }
        const updatedThread: ChatThread = {
          ...thread,
          lastMessage: { preview, at: message.createdAt, senderId: userId },
          unreadCounts,
        };
        store.threads.set(threadId, updatedThread);
        return validateResponse(request, SendChatMessageResponse, message);
      },
    ),
  );

  app.post(
    '/chat/threads/direct',
    withSchema({ body: CreateDirectThreadBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof CreateDirectThreadBody>;
      if (body.withUserId === userId) {
        return sendError(reply, 400, 'INVALID', 'Cannot DM yourself');
      }
      // Look for an existing 1:1 thread.
      for (const thread of store.threads.values()) {
        if (
          thread.type === 'DIRECT' &&
          thread.participantIds.length === 2 &&
          thread.participantIds.includes(userId) &&
          thread.participantIds.includes(body.withUserId)
        ) {
          return validateResponse(request, CreateDirectThreadResponse, {
            thread,
            created: false,
          });
        }
      }
      const threadId = store.nextId('t_dm');
      const thread: ChatThread = {
        threadId,
        type: 'DIRECT',
        participantIds: [userId, body.withUserId],
        unreadCounts: { [userId]: 0, [body.withUserId]: 0 },
        createdAt: new Date().toISOString(),
      };
      store.threads.set(threadId, thread);
      store.chatMessages.set(threadId, []);
      return validateResponse(request, CreateDirectThreadResponse, {
        thread,
        created: true,
      });
    }),
  );

  app.post(
    '/chat/threads/:threadId/read',
    withSchema(
      {
        params: z.object({ threadId: z.string() }),
        body: MarkThreadReadBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { threadId } = request.params as { threadId: string };
        const thread = store.threads.get(threadId);
        if (!thread || !thread.participantIds.includes(userId)) {
          return sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
        }
        const updated: ChatThread = {
          ...thread,
          unreadCounts: { ...thread.unreadCounts, [userId]: 0 },
        };
        store.threads.set(threadId, updated);
        return validateResponse(request, MarkThreadReadResponse, {
          threadId,
          unreadCount: 0,
        });
      },
    ),
  );
};

export default chatRoutes;
