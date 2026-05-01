// useChatThreads — inbox state + counterparty enrichment for DM rows.
//
// `GET /chat/threads` returns each ChatThread with `participantIds` but not
// usernames or avatars. The inbox UI needs a row title for DM threads,
// which is "the other participant's display name". We do that lookup
// client-side (single batched query against `users` for all DM peers),
// gated by RLS — the user can read their friends' rows + their own row,
// and DM peers must already be friends, so this round-trips without
// surprises.

import { useCallback, useEffect, useState } from 'react';
import type { ChatThread, Tables } from '@mei/types';
import { fetchChatThreads } from '../api/chat';
import { ApiError } from '../api/client';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';

export interface ChatThreadView {
  /** Underlying thread row from the api. */
  thread: ChatThread;
  /** Display title for the row — counterparty for DMs, thread.name otherwise. */
  title: string;
  /** Subtitle (used for hangouts in this PR). */
  subtitle?: string;
  /** Initials for the avatar fallback. Empty for STELLA / multi-member. */
  avatarInitials?: string;
  /** Image URL for single-avatar threads (DMs). */
  avatarUrl?: string;
  /** Up to 2 member initials for stacked-avatar threads (groups, hangouts). */
  memberInitials?: string[];
  /** Compact relative time label, e.g. "2m", "3h", "1d", or empty if no msg. */
  timeLabel: string;
  /** unreadCounts[me]. Convenience extracted for the dot indicator. */
  unread: number;
  /** Last message preview text. */
  preview: string;
}

export interface ChatInboxData {
  pinned: ChatThreadView[];
  groups: ChatThreadView[];
  hangouts: ChatThreadView[];
  direct: ChatThreadView[];
}

export type UseChatThreadsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ChatInboxData; refetching: boolean }
  | { status: 'error'; error: ApiError; lastData?: ChatInboxData };

export interface UseChatThreadsResult {
  state: UseChatThreadsState;
  refetch: () => Promise<void>;
}

// ---- Helpers --------------------------------------------------------------

function formatRelative(at: string | undefined): string {
  if (!at) return '';
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const d = new Date(at);
  const day = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mo}`;
}

function deriveInitials(displayName: string, fallback: string): string {
  const cleaned = displayName.trim().replace(/[^a-zA-Z\s]/g, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  if (first && second) return (first + second).toUpperCase();
  if (first) return first.toUpperCase();
  return (fallback[0] ?? '?').toUpperCase();
}

type UserSummaryRow = Pick<
  Tables<'users'>,
  'user_id' | 'username' | 'display_name' | 'avatar_url'
>;

// ---- Hook -----------------------------------------------------------------

export function useChatThreads(): UseChatThreadsResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseChatThreadsState>({ status: 'idle' });

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      if (!session) return;
      setState((prev) => {
        if (isRefetch && prev.status === 'success') return { ...prev, refetching: true };
        return { status: 'loading' };
      });
      try {
        const me = session.user.id;
        const inbox = await fetchChatThreads({ signal });

        // Collect every counterparty userId we need a name for: DM peers +
        // the first 2 members of each group/hangout for stacked avatars.
        const nameTargets = new Set<string>();
        for (const t of inbox.direct) {
          for (const uid of t.participantIds) {
            if (uid !== me) nameTargets.add(uid);
          }
        }
        for (const t of [...inbox.groups, ...inbox.hangouts]) {
          for (const uid of t.participantIds.slice(0, 2)) {
            if (uid !== me) nameTargets.add(uid);
          }
        }

        const userById = new Map<string, UserSummaryRow>();
        if (nameTargets.size > 0) {
          const { data, error } = await supabase
            .from('users')
            .select('user_id, username, display_name, avatar_url')
            .in('user_id', [...nameTargets]);
          if (error) {
            // RLS may hide some rows. Fall through with whatever we got;
            // adapt() defaults to the user's truncated id.
            // eslint-disable-next-line no-console
            console.warn('[chat] users lookup partial', error.message);
          }
          for (const u of (data ?? []) as UserSummaryRow[]) {
            userById.set(u.user_id, u);
          }
        }

        if (signal.aborted) return;

        const adapt = (t: ChatThread): ChatThreadView => {
          const unread = t.unreadCounts[me] ?? 0;
          const timeLabel = formatRelative(t.lastMessage?.at);
          const preview = t.lastMessage?.preview ?? '';
          const view: ChatThreadView = {
            thread: t,
            title: t.name ?? '',
            timeLabel,
            unread,
            preview,
          };
          if (t.type === 'STELLA') {
            view.title = 'Stella';
          } else if (t.type === 'DIRECT') {
            const otherId = t.participantIds.find((p) => p !== me);
            const other = otherId ? userById.get(otherId) : undefined;
            view.title = other?.display_name ?? other?.username ?? otherId?.slice(0, 8) ?? 'Friend';
            view.avatarInitials = deriveInitials(view.title, otherId ?? 'F');
            if (other?.avatar_url) view.avatarUrl = other.avatar_url;
          } else {
            // GROUP / HANGOUT: stack the first two members (excluding self).
            const others = t.participantIds.filter((p) => p !== me).slice(0, 2);
            view.memberInitials = others.map((uid) => {
              const u = userById.get(uid);
              return u
                ? deriveInitials(u.display_name ?? u.username ?? '', uid)
                : (uid[0] ?? '?').toUpperCase();
            });
            if (!view.title) view.title = `Group · ${t.participantIds.length}`;
          }
          return view;
        };

        const data: ChatInboxData = {
          pinned: inbox.pinned.map(adapt),
          groups: inbox.groups.map(adapt),
          hangouts: inbox.hangouts.map(adapt),
          direct: inbox.direct.map(adapt),
        };

        setState({ status: 'success', data, refetching: false });
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        setState((prev) =>
          prev.status === 'success'
            ? { status: 'error', error: apiErr, lastData: prev.data }
            : { status: 'error', error: apiErr },
        );
      }
    },
    [session],
  );

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal, false);
    return () => ctrl.abort();
  }, [session, sessionLoading, load]);

  const refetch = useCallback(async () => {
    if (!session) return;
    const ctrl = new AbortController();
    await load(ctrl.signal, true);
  }, [session, load]);

  return { state, refetch };
}
