// useClosetItemMap — single shared "items by id" lookup for the whole app.
//
// Several screens need to resolve a `Combination`'s itemIds into full
// `ClosetItem` objects (for thumbnails, names, colors): Today's pick,
// Wear-this share modal, the Closet combinations grid. We don't have a
// `GET /closet/items?ids=…` endpoint and the closets we ship in P0 fit
// comfortably under one paginated list call, so the cheapest approach is:
//
//   1. Fetch the user's whole item list once (limit=200 covers anything we
//      expect for P0; if a closet ever exceeds that we'll page).
//   2. Index by itemId.
//   3. Share the result across screens via a module-level promise so the
//      same fetch doesn't fan out into N parallel network calls when
//      multiple components mount on the same render.
//
// This intentionally avoids react-query — the rest of the codebase uses
// hand-rolled hooks with a small state shape, and adding a new dep just
// for this one call doesn't pull its weight yet.

import { useCallback, useEffect, useState } from 'react';
import type { ClosetItem } from '@mei/types';
import { fetchClosetItems } from '../api/closet';
import { ApiError } from '../api/client';
import { useSession } from '../auth/SessionProvider';

// The /closet/items contract caps `limit` at 100 (packages/types Pagination,
// SPEC §7.1). Asking for 200 returns a 400 and the whole resolver shows
// pastel placeholders for every item — which is exactly the symptom this
// hook is meant to fix. If a closet ever exceeds 100 items we'll need to
// page; for P0 it's a generous ceiling.
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  /** User this cache belongs to. Sign-out / user-swap invalidates. */
  userId: string;
  /** Indexed lookup. Empty Map means "fetched, closet is empty". */
  byId: Map<string, ClosetItem>;
  /** Signed image URLs expire and processing rows promote, so keep this short. */
  fetchedAt: number;
}

// Module-level cache + in-flight promise. Two consumers mounting in the same
// tick share one network call; subsequent mounts see the cached Map.
let cache: CacheEntry | null = null;
let inflight: { userId: string; promise: Promise<CacheEntry> } | null = null;
const listeners = new Set<(entry: CacheEntry | null) => void>();

function isFresh(entry: CacheEntry | null, userId: string): entry is CacheEntry {
  return Boolean(entry && entry.userId === userId && Date.now() - entry.fetchedAt < CACHE_TTL_MS);
}

function notify(entry: CacheEntry | null): void {
  for (const listener of listeners) listener(entry);
}

function entryFromItems(userId: string, items: ClosetItem[]): CacheEntry {
  const byId = new Map<string, ClosetItem>();
  for (const item of items) byId.set(item.itemId, item);
  return { userId, byId, fetchedAt: Date.now() };
}

async function loadFor(
  userId: string,
  signal?: AbortSignal,
  opts: { force?: boolean } = {},
): Promise<CacheEntry> {
  if (!opts.force && isFresh(cache, userId)) return cache;
  if (inflight && inflight.userId === userId) return inflight.promise;
  const promise = (async () => {
    const list = await fetchClosetItems({ limit: PAGE_SIZE, signal });
    const entry = entryFromItems(userId, list.items);
    cache = entry;
    notify(entry);
    return entry;
  })();
  inflight = { userId, promise };
  try {
    return await promise;
  } finally {
    if (inflight && inflight.promise === promise) inflight = null;
  }
}

/** Drop the cache. Call from the upload flow after a new item lands so the
 * next consumer sees it. Also called automatically on sign-out. */
export function invalidateClosetItemMap(): void {
  cache = null;
  inflight = null;
  notify(null);
}

/** Prime the shared lookup from another fresh closet fetch. The Closet tab
 * already loads signed item URLs; sharing them here keeps Today from rendering
 * stale blank combination cards while its own resolver cache catches up. */
export function primeClosetItemMap(userId: string, items: ClosetItem[]): void {
  const entry = entryFromItems(userId, items);
  cache = entry;
  inflight = null;
  notify(entry);
}

export type UseClosetItemMapState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; byId: Map<string, ClosetItem> }
  | { status: 'error'; error: ApiError; byId: Map<string, ClosetItem> };

export interface UseClosetItemMapResult {
  state: UseClosetItemMapState;
  /** Convenience: resolve an array of itemIds to items in input order.
   *  Missing items (deleted, RLS-hidden, not yet indexed) come back as
   *  `undefined` rather than being filtered out — keeps OutfitCard slot
   *  alignment with `combination.itemIds`. */
  resolve: (itemIds: string[]) => (ClosetItem | undefined)[];
  refetch: () => Promise<void>;
}

export function useClosetItemMap(): UseClosetItemMapResult {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id ?? null;

  const [state, setState] = useState<UseClosetItemMapState>(() => {
    if (userId && isFresh(cache, userId)) {
      return { status: 'ready', byId: cache.byId };
    }
    return { status: 'idle' };
  });

  useEffect(() => {
    const listener = (entry: CacheEntry | null) => {
      if (!userId) return;
      if (entry && entry.userId === userId) {
        setState({ status: 'ready', byId: entry.byId });
      } else if (entry === null) {
        setState({ status: 'idle' });
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      // Sign-out: invalidate so the next user can't see the previous one's
      // cache (RLS would block it anyway, but cleaner to drop locally too).
      invalidateClosetItemMap();
      setState({ status: 'idle' });
      return;
    }
    if (isFresh(cache, userId)) {
      setState({ status: 'ready', byId: cache.byId });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    loadFor(userId, ctrl.signal)
      .then((entry) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'ready', byId: entry.byId });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        // Hand back an empty map on error — consumers should fall back to
        // the placeholder instead of breaking the page.
        setState({ status: 'error', error: apiErr, byId: new Map() });
      });
    return () => ctrl.abort();
  }, [userId, sessionLoading]);

  const resolve = useCallback(
    (itemIds: string[]): (ClosetItem | undefined)[] => {
      const byId =
        state.status === 'ready' || state.status === 'error' ? state.byId : new Map();
      return itemIds.map((id) => byId.get(id));
    },
    [state],
  );

  const refetch = useCallback(async () => {
    if (!userId) return;
    invalidateClosetItemMap();
    setState({ status: 'loading' });
    try {
      const entry = await loadFor(userId, undefined, { force: true });
      setState({ status: 'ready', byId: entry.byId });
    } catch (err) {
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
      setState({ status: 'error', error: apiErr, byId: new Map() });
    }
  }, [userId]);

  return { state, resolve, refetch };
}
