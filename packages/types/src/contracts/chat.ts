// Chat contracts — SPEC.md §7.2 "Chat".

import { z } from 'zod';
import { zChatMessage, zChatMessageKind, zChatThread } from '../entities.js';
import { paginated, Pagination } from './shared.js';

// ---------- GET /chat/threads ----------
// Inbox: pinned, groups, hangouts, DMs.

export const ListChatThreadsResponse = z.object({
  pinned: z.array(zChatThread),
  groups: z.array(zChatThread),
  hangouts: z.array(zChatThread),
  direct: z.array(zChatThread),
});
export type ListChatThreadsResponse = z.infer<typeof ListChatThreadsResponse>;

// ---------- GET /chat/threads/{threadId} ----------
// Get messages, paginated.

export const GetChatThreadQuery = Pagination;
export type GetChatThreadQuery = z.infer<typeof GetChatThreadQuery>;

export const GetChatThreadResponse = z.object({
  thread: zChatThread,
  messages: paginated(zChatMessage),
});
export type GetChatThreadResponse = z.infer<typeof GetChatThreadResponse>;

// ---------- POST /chat/threads/{threadId}/messages ----------

export const SendChatMessageBody = z
  .object({
    kind: zChatMessageKind,
    text: z.string().max(4000).optional(),
    refId: z.string().optional(), // itemId | comboId | ootdId | s3Key
    clientMessageId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'TEXT' && !val.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'text required when kind is TEXT',
        path: ['text'],
      });
    }
    if (
      (val.kind === 'CLOSET_ITEM' ||
        val.kind === 'COMBINATION' ||
        val.kind === 'OOTD' ||
        val.kind === 'IMAGE') &&
      !val.refId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'refId required for non-TEXT message kinds',
        path: ['refId'],
      });
    }
  });
export type SendChatMessageBody = z.infer<typeof SendChatMessageBody>;

export const SendChatMessageResponse = zChatMessage;
export type SendChatMessageResponse = z.infer<typeof SendChatMessageResponse>;

// ---------- POST /chat/threads/direct ----------
// Find or create a DM thread.

export const CreateDirectThreadBody = z.object({
  withUserId: z.string(),
});
export type CreateDirectThreadBody = z.infer<typeof CreateDirectThreadBody>;

export const CreateDirectThreadResponse = z.object({
  thread: zChatThread,
  created: z.boolean(),
});
export type CreateDirectThreadResponse = z.infer<typeof CreateDirectThreadResponse>;

// ---------- POST /chat/threads/{threadId}/read ----------
// Mark as read.

export const MarkThreadReadBody = z
  .object({
    upToMessageId: z.string().optional(),
  })
  .optional();
export type MarkThreadReadBody = z.infer<typeof MarkThreadReadBody>;

export const MarkThreadReadResponse = z.object({
  threadId: z.string(),
  unreadCount: z.number().int().nonnegative(),
});
export type MarkThreadReadResponse = z.infer<typeof MarkThreadReadResponse>;
