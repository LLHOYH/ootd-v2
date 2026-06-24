// useOotdFeed — visibility-filtered OOTD feed for the Friends tab.
//
// Beyond the basic feed fetch we also enrich each post with the author's
// public summary (display_name + avatar) and the combo's name (for the
// caption fallback). Both go straight via the supabase client (RLS-scoped).
// React/unreact are optimistic — flip the heart immediately, roll back on
// error.

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Closet photos for the post's combination, used when no generated OOTD image exists yet. */
  outfitPreviewItems: OotdFeedPreviewItem[];
  /** Number of ♡ reactions. */
  reactionCount: number;
  /** Did the caller themselves react? Drives the heart-fill state. */
  iReacted: boolean;
}

export interface OotdFeedPreviewItem {
  itemId: string;
  name: string;
  imageUrl?: string;
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

type ComboItemPreviewRow = {
  combo_id: string;
  item_id: string;
  position: number;
  closet_items:
    | {
        item_id: string;
        name: string;
        thumbnail_storage_key: string | null;
        tuned_storage_key: string | null;
      }
    | {
        item_id: string;
        name: string;
        thumbnail_storage_key: string | null;
        tuned_storage_key: string | null;
      }[]
    | null;
};

const SIGNED_PREVIEW_TTL_SEC = 60 * 60;

function deriveInitials(displayName: string, fallback: string): string {
  const cleaned = displayName.trim().replace(/[^a-zA-Z\s]/g, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  if (first && second) return (first + second).toUpperCase();
  if (first) return first.toUpperCase();
  return (fallback[0] ?? '?').toUpperCase();
}

async function signClosetPreviewUrl(
  thumbnailKey: string | null | undefined,
  tunedKey: string | null | undefined,
): Promise<string | undefined> {
  const path = thumbnailKey ?? tunedKey;
  if (!path) return undefined;
  const { data, error } = await supabase
    .storage
    .from('closet-tuned')
    .createSignedUrl(path, SIGNED_PREVIEW_TTL_SEC);
  if (error || !data?.signedUrl) return undefined;
  return data.signedUrl;
}

export function useOotdFeed(): UseOotdFeedResult {
  const { session, loading: sessionLoading } = useSession();
  const pendingReactionIdsRef = useRef<Set<string>>(new Set());
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
        const comboIds = Array.from(
          new Set(posts.filter((p) => p.shareDresses !== false).map((p) => p.comboId)),
        );

        const [usersRes, combosRes, comboItemsRes] = await Promise.all([
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
          comboIds.length > 0
            ? supabase
                .from('combination_items')
                .select(
                  `combo_id,
                   item_id,
                   position,
                   closet_items (
                     item_id,
                     name,
                     thumbnail_storage_key,
                     tuned_storage_key
                   )`,
                )
                .in('combo_id', comboIds)
                .order('position', { ascending: true })
            : Promise.resolve({ data: [] as ComboItemPreviewRow[], error: null }),
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
        const previewByCombo = new Map<string, OotdFeedPreviewItem[]>();
        if (comboItemsRes.error) {
          // eslint-disable-next-line no-console
          console.warn('[ootd-feed] failed to load combo preview items', comboItemsRes.error);
        } else {
          const previewRows = ((comboItemsRes.data ?? []) as ComboItemPreviewRow[])
            .slice()
            .sort((a, b) => a.position - b.position);
          const previews = await Promise.all(
            previewRows.map(async (row) => {
              const item = Array.isArray(row.closet_items)
                ? row.closet_items[0]
                : row.closet_items;
              if (!item) return null;
              const imageUrl = await signClosetPreviewUrl(
                item.thumbnail_storage_key,
                item.tuned_storage_key,
              );
              return {
                comboId: row.combo_id,
                item: {
                  itemId: row.item_id,
                  name: item.name,
                  ...(imageUrl ? { imageUrl } : {}),
                } satisfies OotdFeedPreviewItem,
              };
            }),
          );
          for (const preview of previews) {
            if (!preview) continue;
            const list = previewByCombo.get(preview.comboId) ?? [];
            list.push(preview.item);
            previewByCombo.set(preview.comboId, list);
          }
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
            outfitPreviewItems:
              p.shareDresses === false ? [] : previewByCombo.get(p.comboId) ?? [],
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
      if (pendingReactionIdsRef.current.has(ootdId)) return;
      pendingReactionIdsRef.current.add(ootdId);
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
      } finally {
        pendingReactionIdsRef.current.delete(ootdId);
      }
    },
    [session],
  );

  return { state, refetch, toggleReaction };
}
