// useOotdFeed — visibility-filtered OOTD feed for the Friends tab.
//
// Beyond the basic feed fetch we also enrich each post with the author's
// public summary (display_name + avatar) and the combo's name (for the
// caption fallback). Both go straight via the supabase client (RLS-scoped).
// React/unreact are optimistic — flip the heart immediately, roll back on
// error.

import { useCallback, useEffect, useState } from 'react';
import type { OOTDPost, Tables } from '@mei/types';
import { ApiError } from '../api/client';
import { fetchOotdFeed, reactOotd, unreactOotd } from '../api/ootd';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';

export interface OotdFeedItem {
  post: OOTDPost;
  /** Author's display name. Falls back to username, then truncated id. */
  authorName: string;
  /** Author's avatar URL (optional). */
  authorAvatarUrl?: string;
  /** Initials for the avatar fallback. */
  authorInitials: string;
  /** Underlying combination's name, when available. */
  comboName?: string;
  /** Number of ♡ reactions. */
  reactionCount: number;
  /** Did the caller themselves react? Drives the heart-fill state. */
  iReacted: boolean;
}

export type UseOotdFeedState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; items: OotdFeedItem[]; refetching: boolean }
  | { status: 'error'; error: ApiError; lastItems?: OotdFeedItem[] };

export interface UseOotdFeedResult {
  state: UseOotdFeedState;
  refetch: () => Promise<void>;
  toggleReaction: (ootdId: string) => Promise<void>;
}

const PAGE_SIZE = 20;

type UserSummaryRow = Pick<
  Tables<'users'>,
  'user_id' | 'username' | 'display_name' | 'avatar_url'
>;

type ComboRow = Pick<Tables<'combinations'>, 'combo_id' | 'name'>;

function deriveInitials(displayName: string, fallback: string): string {
  const cleaned = displayName.trim().replace(/[^a-zA-Z\s]/g, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  if (first && second) return (first + second).toUpperCase();
  if (first) return first.toUpperCase();
  return (fallback[0] ?? '?').toUpperCase();
}

export function useOotdFeed(): UseOotdFeedResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseOotdFeedState>({ status: 'idle' });

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      if (!session) return;
      setState((prev) => {
        if (isRefetch && prev.status === 'success') return { ...prev, refetching: true };
        return { status: 'loading' };
      });
      try {
        const me = session.user.id;
        const feed = await fetchOotdFeed({ signal, limit: PAGE_SIZE });
        const posts = feed.items;
        if (signal.aborted) return;

        // Batch enrichment: author + combo lookups.
        const authorIds = Array.from(new Set(posts.map((p) => p.userId)));
        const comboIds = Array.from(new Set(posts.map((p) => p.comboId)));

        const [usersRes, combosRes] =
          authorIds.length === 0 && comboIds.length === 0
            ? [
                { data: [] as UserSummaryRow[], error: null },
                { data: [] as ComboRow[], error: null },
              ]
            : await Promise.all([
                authorIds.length > 0
                  ? supabase
                      .from('users')
                      .select('user_id, username, display_name, avatar_url')
                      .in('user_id', authorIds)
                  : Promise.resolve({ data: [] as UserSummaryRow[], error: null }),
                comboIds.length > 0
                  ? supabase
                      .from('combinations')
                      .select('combo_id, name')
                      .in('combo_id', comboIds)
                  : Promise.resolve({ data: [] as ComboRow[], error: null }),
              ]);

        if (signal.aborted) return;

        const userById = new Map<string, UserSummaryRow>();
        for (const u of (usersRes.data ?? []) as UserSummaryRow[]) {
          userById.set(u.user_id, u);
        }
        const comboById = new Map<string, ComboRow>();
        for (const c of (combosRes.data ?? []) as ComboRow[]) {
          comboById.set(c.combo_id, c);
        }

        const items: OotdFeedItem[] = posts.map((p) => {
          const u = userById.get(p.userId);
          const authorName = u?.display_name ?? u?.username ?? p.userId.slice(0, 8);
          const reactionCount = p.reactions.length;
          const iReacted = p.reactions.some((r) => r.userId === me);
          const item: OotdFeedItem = {
            post: p,
            authorName,
            authorInitials: deriveInitials(authorName, p.userId),
            reactionCount,
            iReacted,
          };
          if (u?.avatar_url) item.authorAvatarUrl = u.avatar_url;
          const combo = comboById.get(p.comboId);
          if (combo?.name) item.comboName = combo.name;
          return item;
        });

        setState({ status: 'success', items, refetching: false });
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        setState((prev) =>
          prev.status === 'success'
            ? { status: 'error', error: apiErr, lastItems: prev.items }
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

  const toggleReaction = useCallback(
    async (ootdId: string) => {
      const me = session?.user.id;
      if (!me) return;
      // Snapshot for rollback
      let prevSnapshot: OotdFeedItem[] | undefined;
      let willReact = false;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        prevSnapshot = prev.items;
        const next = prev.items.map((it) => {
          if (it.post.ootdId !== ootdId) return it;
          if (it.iReacted) {
            willReact = false;
            return {
              ...it,
              iReacted: false,
              reactionCount: Math.max(0, it.reactionCount - 1),
            };
          }
          willReact = true;
          return { ...it, iReacted: true, reactionCount: it.reactionCount + 1 };
        });
        return { ...prev, items: next };
      });
      try {
        if (willReact) await reactOotd(ootdId);
        else await unreactOotd(ootdId);
      } catch (err) {
        // Roll back optimistic flip.
        if (prevSnapshot) {
          const snap = prevSnapshot;
          setState((prev) =>
            prev.status === 'success' ? { ...prev, items: snap } : prev,
          );
        }
      }
    },
    [session],
  );

  return { state, refetch, toggleReaction };
}
