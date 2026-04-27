// Stella contracts — SPEC.md §7.2 "Stella".
// Streaming responses are SSE per §7.3; the response schemas describe the
// JSON shapes the server emits; SSE event framing is the transport's concern.

import { z } from 'zod';
import {
  zOccasion,
  zStellaConversation,
  zStellaMessage,
} from '../entities';

// ---------- POST /stella/conversations ----------
// Start a new conversation; returns convoId.

export const CreateStellaConversationBody = z
  .object({
    title: z.string().max(120).optional(),
    seedMessage: z.string().max(4000).optional(),
    occasion: zOccasion.optional(),
  })
  .optional();
export type CreateStellaConversationBody = z.infer<
  typeof CreateStellaConversationBody
>;

export const CreateStellaConversationResponse = z.object({
  convoId: z.string(),
  conversation: zStellaConversation,
});
export type CreateStellaConversationResponse = z.infer<
  typeof CreateStellaConversationResponse
>;

// ---------- GET /stella/conversations ----------

export const ListStellaConversationsResponse = z.object({
  items: z.array(zStellaConversation),
});
export type ListStellaConversationsResponse = z.infer<
  typeof ListStellaConversationsResponse
>;

// ---------- GET /stella/conversations/{convoId} ----------

export const GetStellaConversationResponse = z.object({
  conversation: zStellaConversation,
  messages: z.array(zStellaMessage),
});
export type GetStellaConversationResponse = z.infer<
  typeof GetStellaConversationResponse
>;

// ---------- POST /stella/conversations/{convoId}/messages ----------
// Streams the response (SSE, §7.3). The non-streaming JSON envelope is
// what callers see when buffering the SSE stream into a single message.

export const SendStellaMessageBody = z.object({
  text: z.string().min(1).max(4000),
  // Optional client-side message id for echo / dedupe.
  clientMessageId: z.string().optional(),
});
export type SendStellaMessageBody = z.infer<typeof SendStellaMessageBody>;

/** Final assistant message after stream completes. */
export const SendStellaMessageResponse = z.object({
  userMessage: zStellaMessage,
  assistantMessage: zStellaMessage,
});
export type SendStellaMessageResponse = z.infer<
  typeof SendStellaMessageResponse
>;

/**
 * Individual SSE event payload shapes. These are what each `data:` line
 * decodes to; the wire format is one JSON object per line.
 */
export const StellaSseEvent = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('message_start'),
    messageId: z.string(),
  }),
  z.object({
    event: z.literal('text_delta'),
    delta: z.string(),
  }),
  z.object({
    event: z.literal('tool_call'),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    event: z.literal('message_stop'),
    messageId: z.string(),
  }),
  z.object({
    event: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
]);
export type StellaSseEvent = z.infer<typeof StellaSseEvent>;

// ---------- DELETE /stella/conversations/{convoId} ----------
export { EmptyResponse as DeleteStellaConversationResponse } from './shared';
