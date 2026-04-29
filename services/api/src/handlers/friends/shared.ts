// Shared helpers for the friends + public-profile domain.
//
// Two responsibilities:
//   1. Map snake_case rows from `users` to the camelCase `FriendSummary`
//      shape used in lists / search / suggestions / requests.
//   2. Provide tiny utilities used across handlers: canonical friendship
//      ordering, OOTD row mapping, and a base64 cursor for pagination.
//
// The friendship canonical ordering helper exists only because we need a
// concrete `(user_a, user_b)` pair for INSERT and DELETE statements. It
// mirrors the SQL `least(a, b) / greatest(a, b)` used inside the
// `is_friend()` and `get_friends()` helpers — those helpers stay the
// authoritative source of truth for *reads*, but the canonical pair is
// required for writes since you can't `select least()` mid-INSERT.

import type {
  FriendSummary,
  OOTDPost,
  OOTDVisibility,
  Tables,
} from '@mei/types';

// ---------------------------------------------------------------------------
// User row → FriendSummary
// ---------------------------------------------------------------------------

/** The columns we need from `users` to build a FriendSummary. */
export type UserSummaryRow = Pick<
  Tables<'users'>,
  'user_id' | 'username' | 'display_name' | 'avatar_url' | 'city' | 'country_code'
>;

export function mapFriendSummary(row: UserSummaryRow): FriendSummary {
  const out: FriendSummary = {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
  };
  if (row.avatar_url) out.avatarUrl = row.avatar_url;
  if (row.city) out.city = row.city;
  if (row.country_code) out.countryCode = row.country_code;
  return out;
}

// ---------------------------------------------------------------------------
// OOTD row → OOTDPost
// ---------------------------------------------------------------------------

/**
 * Resolve a public storage URL for an `ootd` bucket key. RLS on the
 * `ootd` bucket gates access — for posts where visibility allows the
 * caller through, the public URL resolves; otherwise the storage layer
 * 403s. We compose the URL directly rather than calling Supabase's
 * `getPublicUrl` because it's a deterministic concatenation.
 */
export function publicOotdUrl(supabaseUrl: string, storageKey: string): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/ootd/${storageKey}`;
}

/** Row shape for an `ootd_posts` row plus its joined `ootd_reactions`. */
export interface OotdPostRowWithReactions
  extends Pick<
    Tables<'ootd_posts'>,
    | 'ootd_id'
    | 'user_id'
    | 'combo_id'
    | 'caption'
    | 'location_name'
    | 'try_on_storage_key'
    | 'fallback_outfit_card_storage_key'
    | 'visibility'
    | 'visibility_targets'
    | 'created_at'
  > {
  ootd_reactions:
    | { user_id: string; type: string }[]
    | null;
}

export function mapOotdPost(
  row: OotdPostRowWithReactions,
  supabaseUrl: string,
): OOTDPost {
  const out: OOTDPost = {
    ootdId: row.ootd_id,
    userId: row.user_id,
    comboId: row.combo_id,
    visibility: row.visibility as OOTDVisibility,
    reactions: (row.ootd_reactions ?? [])
      // Only the literal '♡' reaction is part of the contract; defensively
      // map and let the schema reject anything unexpected.
      .filter((r) => r.type === '♡')
      .map((r) => ({ userId: r.user_id, type: '♡' as const })),
    createdAt: row.created_at,
  };
  if (row.caption) out.caption = row.caption;
  if (row.location_name) out.locationName = row.location_name;
  if (row.try_on_storage_key) {
    out.tryOnPhotoUrl = publicOotdUrl(supabaseUrl, row.try_on_storage_key);
  }
  if (row.fallback_outfit_card_storage_key) {
    out.fallbackOutfitCardUrl = publicOotdUrl(
      supabaseUrl,
      row.fallback_outfit_card_storage_key,
    );
  }
  if (row.visibility_targets && row.visibility_targets.length > 0) {
    out.visibilityTargets = row.visibility_targets;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canonical friendship ordering — for INSERT / DELETE only.
//
// Reads should go through the `is_friend()` and `get_friends()` SQL
// helpers, both defined in 0001_init_schema.sql. Writes still need a
// concrete (user_a, user_b) pair, so we replicate the same lexicographic
// ordering here. The schema enforces `check (user_a < user_b)` so any
// mismatch will surface as an INSERT error rather than silently
// duplicating rows.
// ---------------------------------------------------------------------------

export function canonicalFriendshipPair(
  a: string,
  b: string,
): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

// ---------------------------------------------------------------------------
// Cursor — base64 `{ offset }` to match the rest of the codebase's
// pagination shape (see services/api/src/handlers/today/shared.ts).
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
