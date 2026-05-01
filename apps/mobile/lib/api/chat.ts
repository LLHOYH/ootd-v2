// Typed wrappers for the api Lambda's `/chat` domain (SPEC §10.6 + §10.7).

import type {
  CreateDirectThreadBody,
  CreateDirectThreadResponse,
  GetChatThreadResponse,
  ListChatThreadsResponse,
  MarkThreadReadBody,
  MarkThreadReadResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from '@mei/types';
import { apiFetch } from './client';

/** GET /chat/threads — caller's inbox, grouped by type. */
export function fetchChatThreads(
  opts: { signal?: AbortSignal } = {},
): Promise<ListChatThreadsResponse> {
  return apiFetch<ListChatThreadsResponse>('/chat/threads', { signal: opts.signal });
}

/**
 * GET /chat/threads/:threadId — thread metadata + paginated messages
 * (newest-first). Returns at most `limit` messages with a base64 cursor.
 */
export function fetchChatThread(
  threadId: string,
  opts: { signal?: AbortSignal; cursor?: string; limit?: number } = {},
): Promise<GetChatThreadResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const path = `/chat/threads/${encodeURIComponent(threadId)}${qs ? `?${qs}` : ''}`;
  return apiFetch<GetChatThreadResponse>(path, { signal: opts.signal });
}

/** POST /chat/threads/:threadId/messages — append a TEXT (or rich) message. */
export function sendChatMessage(
  threadId: string,
  body: SendChatMessageBody,
  opts: { signal?: AbortSignal } = {},
): Promise<SendChatMessageResponse> {
  return apiFetch<SendChatMessageResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/messages`,
    { method: 'POST', body, signal: opts.signal },
  );
}

/** POST /chat/threads/:threadId/read — zero out the caller's unread_count. */
export function markChatThreadRead(
  threadId: string,
  body: MarkThreadReadBody = {},
  opts: { signal?: AbortSignal } = {},
): Promise<MarkThreadReadResponse> {
  return apiFetch<MarkThreadReadResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/read`,
    { method: 'POST', body, signal: opts.signal },
  );
}

/** POST /chat/threads/direct — find-or-create a DM thread with `withUserId`. */
export function createDirectThread(
  body: CreateDirectThreadBody,
  opts: { signal?: AbortSignal } = {},
): Promise<CreateDirectThreadResponse> {
  return apiFetch<CreateDirectThreadResponse>('/chat/threads/direct', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}
