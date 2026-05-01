// Dispatch pipeline — convert an inbound NotificationEvent into a list of
// PushMessages and send them via the configured provider.
//
// Steps:
//   1. Validate the event payload via Zod.
//   2. Fetch the recipient's push tokens (service-role; RLS would otherwise
//      block reads of another user's tokens).
//   3. Build a per-platform PushMessage from a small router of formatters
//      keyed by event type.
//   4. Send via the provider; collect receipts.
//   5. (Future) On DeviceNotRegistered receipts, prune the offending row
//      from push_tokens. Out of scope for this PR — captured as a TODO.

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotifierConfig } from '../config';
import { getPushProvider, type PushMessage, type PushReceipt } from '../providers/push';

// ---------------------------------------------------------------------------
// Event shapes.
// ---------------------------------------------------------------------------

export const FriendRequestEvent = z.object({
  type: z.literal('FRIEND_REQUEST'),
  recipientUserId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  fromDisplayName: z.string().optional(),
});
export type FriendRequestEvent = z.infer<typeof FriendRequestEvent>;

export const FriendAcceptedEvent = z.object({
  type: z.literal('FRIEND_ACCEPTED'),
  recipientUserId: z.string().uuid(),
  acceptedByUserId: z.string().uuid(),
  acceptedByDisplayName: z.string().optional(),
});
export type FriendAcceptedEvent = z.infer<typeof FriendAcceptedEvent>;

export const ChatMessageEvent = z.object({
  type: z.literal('CHAT_MESSAGE'),
  recipientUserId: z.string().uuid(),
  threadId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderDisplayName: z.string().optional(),
  preview: z.string().max(200),
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEvent>;

export const OotdReactionEvent = z.object({
  type: z.literal('OOTD_REACTION'),
  recipientUserId: z.string().uuid(),
  ootdId: z.string().uuid(),
  reactorUserId: z.string().uuid(),
  reactorDisplayName: z.string().optional(),
});
export type OotdReactionEvent = z.infer<typeof OotdReactionEvent>;

export const NotificationEvent = z.discriminatedUnion('type', [
  FriendRequestEvent,
  FriendAcceptedEvent,
  ChatMessageEvent,
  OotdReactionEvent,
]);
export type NotificationEvent = z.infer<typeof NotificationEvent>;

// ---------------------------------------------------------------------------
// Per-type formatter — produces the title, body, and structured data
// payload the mobile client receives.
// ---------------------------------------------------------------------------

interface Formatted {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

function formatEvent(ev: NotificationEvent): Formatted {
  switch (ev.type) {
    case 'FRIEND_REQUEST':
      return {
        title: 'New friend request',
        body: ev.fromDisplayName
          ? `${ev.fromDisplayName} wants to connect.`
          : 'Someone wants to connect.',
        data: { type: ev.type, fromUserId: ev.fromUserId },
      };
    case 'FRIEND_ACCEPTED':
      return {
        title: 'Friend request accepted',
        body: ev.acceptedByDisplayName
          ? `${ev.acceptedByDisplayName} accepted your request.`
          : 'Your friend request was accepted.',
        data: { type: ev.type, acceptedByUserId: ev.acceptedByUserId },
      };
    case 'CHAT_MESSAGE':
      return {
        title: ev.senderDisplayName ?? 'New message',
        body: ev.preview,
        data: {
          type: ev.type,
          threadId: ev.threadId,
          senderUserId: ev.senderUserId,
        },
      };
    case 'OOTD_REACTION':
      return {
        title: 'New reaction',
        body: ev.reactorDisplayName
          ? `${ev.reactorDisplayName} reacted to your OOTD ♡`
          : 'Someone reacted to your OOTD ♡',
        data: { type: ev.type, ootdId: ev.ootdId },
      };
  }
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

export interface DispatchResult {
  status: 'sent' | 'no-tokens' | 'failed';
  recipientUserId: string;
  type: NotificationEvent['type'];
  receipts: PushReceipt[];
  detail?: string;
}

export async function dispatchNotification(
  cfg: NotifierConfig,
  supabase: SupabaseClient,
  ev: NotificationEvent,
  logger: { info: (m: string, ctx?: object) => void; warn: (m: string, ctx?: object) => void; error: (m: string, ctx?: object) => void } = console,
): Promise<DispatchResult> {
  const ctx = { type: ev.type, recipientUserId: ev.recipientUserId };

  // Lookup the recipient's tokens. Service-role; bypasses
  // push_tokens_select_self.
  const { data: tokenRows, error: tokenErr } = await supabase
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', ev.recipientUserId);
  if (tokenErr) {
    logger.error('token lookup failed', { ...ctx, err: tokenErr.message });
    return {
      status: 'failed',
      recipientUserId: ev.recipientUserId,
      type: ev.type,
      receipts: [],
      detail: tokenErr.message,
    };
  }
  const tokens = (tokenRows ?? []) as { token: string; platform: string }[];
  if (tokens.length === 0) {
    logger.info('no tokens for recipient — skipping', ctx);
    return {
      status: 'no-tokens',
      recipientUserId: ev.recipientUserId,
      type: ev.type,
      receipts: [],
    };
  }

  const formatted = formatEvent(ev);
  const messages: PushMessage[] = tokens.map((t) => ({
    to: t.token,
    title: formatted.title,
    body: formatted.body,
    data: formatted.data,
    sound: 'default',
    channelId: 'default',
  }));

  const provider = getPushProvider(cfg);
  const receipts = await provider.send(messages);

  // TODO: prune push_tokens rows whose receipt is DeviceNotRegistered.
  // Out of scope — handled in feat/notifier-receipts.

  logger.info('dispatched', { ...ctx, count: receipts.length });
  return {
    status: 'sent',
    recipientUserId: ev.recipientUserId,
    type: ev.type,
    receipts,
  };
}
