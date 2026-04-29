// Shared helpers for the OOTD domain handlers.
//
// Two responsibilities:
//   1. Map the snake_case `ootd_posts` rows + their reactions into the
//      camelCase `OOTDPost` contract from `@mei/types`.
//   2. Resolve image URLs for the try-on photo / fallback OutfitCard. The
//      `ootd` Supabase Storage bucket is NOT public — reads are gated by
//      `ootd_visibility_scoped` (storage RLS, mirrors the post-level
//      visibility per §12.3 + 0003_storage_buckets.sql §6). We mint a
//      short-lived signed URL with the *user-scoped* Supabase client so
//      the underlying storage RLS evaluates for `auth.uid()`. If the
//      caller can't see the object, the signed-URL request itself fails
//      (we degrade to omitting the URL).
//
// Pure-ish: no calls to lib/storage.ts here because that module signs
// with the service-role key (bypasses RLS). For OOTD reads we want the
// caller's RLS to apply, so we go through the user-scoped client we
// already have on `ctx.supabase`.
//
// Also encodes the same opaque base64 `{ offset }` cursor as
// `today/shared.ts` and `mock-server` so the frontend pages identically
// against either backend (§7.1).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tables } from '@mei/types';
import type { OOTDPost, OOTDVisibility } from '@mei/types';

// ---------------------------------------------------------------------------
// Cursor — base64url `{ offset }`. Same shape as today/shared.ts so the
// client pages identically.
// ---------------------------------------------------------------------------

export interface CursorPayload {
  offset: number;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorPayload {
  if (!cursor) return { offset: 0 };
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      return { offset: 0 };
    }
    return parsed;
  } catch {
    return { offset: 0 };
  }
}

// ---------------------------------------------------------------------------
// Reaction summary — one row per (ootd_id, user_id), so the count per OOTD
// is `count(*)` and "did the requester react?" is a simple `bool_or` over
// `user_id = auth.uid()`. Postgrest doesn't expose aggregates conveniently
// on the per-request RLS client, so we just pull the rows and aggregate
// in code. Reaction rows are tiny (PK only) and the post pages are small
// (default limit 20, max 100), so this stays cheap.
// ---------------------------------------------------------------------------

export interface ReactionSummary {
  /** All reactions on the post — surfaced as `reactions` on `OOTDPost`. */
  reactions: { userId: string; type: '♡' }[];
  /** Convenience counts for the react/unreact response shapes. */
  count: number;
  /** Did the requester themselves react? Drives the heart-fill UI state. */
  meReacted: boolean;
}

/**
 * Fetch reactions for a set of OOTD ids in a single round-trip. Returns
 * a map keyed by `ootdId`. Empty entries are filled in for missing keys
 * so callers can call `.get(id) ?? EMPTY` without branching.
 *
 * The supabase client is user-scoped, so RLS gates which reactions the
 * caller can see. `ootd_reactions_select_visible` allows SELECT iff the
 * parent OOTD is visible — same predicate that gated the OOTD list, so
 * we never return reactions for posts the caller isn't supposed to know
 * exist.
 */
export async function fetchReactionSummaries(
  supabase: SupabaseClient,
  ootdIds: string[],
  requesterUserId: string,
): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  // Pre-seed empty entries so callers always get a deterministic object.
  for (const id of ootdIds) {
    out.set(id, { reactions: [], count: 0, meReacted: false });
  }
  if (ootdIds.length === 0) return out;

  const { data, error } = await supabase
    .from('ootd_reactions')
    .select('ootd_id, user_id, type')
    .in('ootd_id', ootdIds);

  if (error) {
    // Don't fail the whole feed on a reactions-load error. Empty summaries
    // mean a 0 count + no heart-fill state — degraded but not broken.
    // eslint-disable-next-line no-console
    console.error('[ootd] failed to load reactions; rendering empty', error);
    return out;
  }

  type Row = { ootd_id: string; user_id: string; type: string };
  for (const row of (data ?? []) as Row[]) {
    const summary = out.get(row.ootd_id);
    if (!summary) continue;
    // The schema's `type` column is free-text (default '♡') but the API
    // contract pins `type: '♡'`. Coerce here — anything else is ignored.
    if (row.type !== '♡') continue;
    summary.reactions.push({ userId: row.user_id, type: '♡' });
    summary.count += 1;
    if (row.user_id === requesterUserId) summary.meReacted = true;
  }
  return out;
}

/**
 * Sum a single OOTD's reaction count. Used by react/unreact handlers so
 * they can return the post-mutation count without re-running the bigger
 * `fetchReactionSummaries`.
 */
export async function fetchReactionCount(
  supabase: SupabaseClient,
  ootdId: string,
): Promise<number> {
  // `head: true` returns count without rows; cheaper than fetching them.
  const { count, error } = await supabase
    .from('ootd_reactions')
    .select('ootd_id', { count: 'exact', head: true })
    .eq('ootd_id', ootdId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ootd] failed to count reactions', error);
    return 0;
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Storage URL helpers.
//
// `ootd` is a private bucket gated by `ootd_visibility_scoped` (RLS).
// We mint a short-lived signed URL via the user-scoped client so the
// caller's RLS evaluates — if they can't read the object, the URL
// request fails and we just omit the field. The image-worker writes
// `try_on_storage_key` (P1) and `fallback_outfit_card_storage_key` (P0).
// ---------------------------------------------------------------------------

const OOTD_SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour — matches lib/storage default.

/**
 * Sign a download URL with the user-scoped client. Returns `undefined`
 * on failure (RLS-denied or transient) so the mapper can omit the field
 * cleanly.
 */
async function signOotdObjectUrl(
  supabase: SupabaseClient,
  storageKey: string,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .storage
    .from('ootd')
    .createSignedUrl(storageKey, OOTD_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return undefined;
  return data.signedUrl;
}

/**
 * Resolve both image URLs for an OOTD post in parallel. Either may be
 * `undefined` (e.g. P0 posts have no try-on photo until the image-worker
 * runs; visibility-denied reads fall back to undefined).
 */
export async function resolveOotdImageUrls(
  supabase: SupabaseClient,
  row: Pick<
    Tables<'ootd_posts'>,
    'try_on_storage_key' | 'fallback_outfit_card_storage_key'
  >,
): Promise<{ tryOnPhotoUrl?: string; fallbackOutfitCardUrl?: string }> {
  const [tryOn, fallback] = await Promise.all([
    row.try_on_storage_key
      ? signOotdObjectUrl(supabase, row.try_on_storage_key)
      : Promise.resolve(undefined),
    row.fallback_outfit_card_storage_key
      ? signOotdObjectUrl(supabase, row.fallback_outfit_card_storage_key)
      : Promise.resolve(undefined),
  ]);
  const out: { tryOnPhotoUrl?: string; fallbackOutfitCardUrl?: string } = {};
  if (tryOn) out.tryOnPhotoUrl = tryOn;
  if (fallback) out.fallbackOutfitCardUrl = fallback;
  return out;
}

// ---------------------------------------------------------------------------
// Row → API mapper.
// ---------------------------------------------------------------------------

/**
 * Map an `ootd_posts` row + its reaction summary + already-signed image
 * URLs into the `OOTDPost` contract shape. Optional fields are omitted
 * (`undefined`) rather than nulled so the JSON envelope matches Zod's
 * `.optional()` (not `.nullable()`).
 */
export function mapOotdPost(
  row: Tables<'ootd_posts'>,
  reactions: ReactionSummary,
  urls: { tryOnPhotoUrl?: string; fallbackOutfitCardUrl?: string },
): OOTDPost {
  const out: OOTDPost = {
    ootdId: row.ootd_id,
    userId: row.user_id,
    comboId: row.combo_id,
    visibility: row.visibility as OOTDVisibility,
    reactions: reactions.reactions,
    createdAt: row.created_at,
  };
  if (row.caption != null) out.caption = row.caption;
  if (row.location_name != null) out.locationName = row.location_name;
  if (urls.tryOnPhotoUrl) out.tryOnPhotoUrl = urls.tryOnPhotoUrl;
  if (urls.fallbackOutfitCardUrl) {
    out.fallbackOutfitCardUrl = urls.fallbackOutfitCardUrl;
  }
  // `visibility_targets` is `not null default '{}'` in the DB; only surface
  // it when actually populated to match the optional-array contract shape.
  if (row.visibility_targets && row.visibility_targets.length > 0) {
    out.visibilityTargets = row.visibility_targets;
  }
  return out;
}
