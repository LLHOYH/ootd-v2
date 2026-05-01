// Typed wrappers for the Stella surface (SPEC §10.5 + §8).
//
// Two transports:
//   - api Lambda — conversation CRUD (list, create, get, delete).
//   - stylist server (Render) — POST /stella/conversations/:id/messages
//     streams Server-Sent Events as Stella's reply tokens come in.

import type {
  CreateStellaConversationBody,
  CreateStellaConversationResponse,
  GetStellaConversationResponse,
  ListStellaConversationsResponse,
  SendStellaMessageBody,
  StellaSseEvent,
} from '@mei/types';
import { ApiError, apiFetch, getStylistBaseUrl } from './client';
import { supabase } from '../supabase';

// ---------- api Lambda CRUD ----------

export function listStellaConversations(
  opts: { signal?: AbortSignal } = {},
): Promise<ListStellaConversationsResponse> {
  return apiFetch<ListStellaConversationsResponse>('/stella/conversations', {
    signal: opts.signal,
  });
}

export function createStellaConversation(
  body: CreateStellaConversationBody = {},
  opts: { signal?: AbortSignal } = {},
): Promise<CreateStellaConversationResponse> {
  return apiFetch<CreateStellaConversationResponse>('/stella/conversations', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}

export function getStellaConversation(
  convoId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GetStellaConversationResponse> {
  return apiFetch<GetStellaConversationResponse>(
    `/stella/conversations/${encodeURIComponent(convoId)}`,
    { signal: opts.signal },
  );
}

export function deleteStellaConversation(
  convoId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  return apiFetch<unknown>(`/stella/conversations/${encodeURIComponent(convoId)}`, {
    method: 'DELETE',
    signal: opts.signal,
  });
}

// ---------- stylist SSE stream ----------

export interface StreamStellaMessageHandlers {
  onEvent: (ev: StellaSseEvent) => void;
  /** Resolves when the stream closes cleanly (saw `[DONE]`). */
  onDone?: () => void;
  /** Called on transport / parse failures. */
  onError?: (err: Error) => void;
}

/**
 * POST text → stylist server, parse the SSE stream as it lands, dispatch
 * each `StellaSseEvent` via `onEvent`.
 *
 * The bearer token is fetched from the active Supabase session (token
 * refresh is handled by the supabase client). For React Native, the
 * underlying fetch implementation supports streaming response bodies
 * (`response.body.getReader()`) on Hermes 0.74+.
 */
export async function streamStellaMessage(
  convoId: string,
  body: SendStellaMessageBody,
  handlers: StreamStellaMessageHandlers,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  const url = `${getStylistBaseUrl()}/stella/conversations/${encodeURIComponent(convoId)}/messages`;
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    throw new ApiError(401, 'UNAUTHENTICATED', sessionErr.message);
  }
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'No active session');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(0, 'NETWORK_ERROR', msg);
  }

  if (!res.ok) {
    const text = await res.text();
    let parsed: { error?: { code?: string; message?: string } } | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* leave undefined */
    }
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? `HTTP_${res.status}`,
      parsed?.error?.message ?? res.statusText,
      parsed,
    );
  }

  if (!res.body) {
    throw new ApiError(0, 'NO_BODY', 'Stylist response had no body');
  }

  // Read the stream chunk-by-chunk and parse SSE frames split by \n\n.
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith('data:')) continue;
        const data = frame.slice(5).trim();
        if (data === '[DONE]') {
          handlers.onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data) as StellaSseEvent;
          handlers.onEvent(parsed);
        } catch (err) {
          // Treat as a non-fatal parse failure — keep reading the stream.
          handlers.onError?.(
            err instanceof Error ? err : new Error('Bad SSE frame'),
          );
        }
      }
    }
    // Stream ended without a [DONE] sentinel. Treat as a clean close.
    handlers.onDone?.();
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return;
    const e = err instanceof Error ? err : new Error('Stream read failed');
    handlers.onError?.(e);
    throw e;
  }
}
