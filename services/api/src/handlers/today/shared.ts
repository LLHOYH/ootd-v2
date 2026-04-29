// Helpers shared across the Today domain handlers.
//
// Two responsibilities:
//   1. Map snake_case DB rows to the camelCase shapes that the @mei/types
//      contract Zod schemas expect. We spell every field out explicitly so
//      the supabase-js generic doesn't quietly drop or rename anything.
//   2. Compute the "age band" string surfaced in the §10.1 community-looks
//      strip per the §12.6 anonymisation rule (e.g. "25-29").
//
// Nothing here makes network calls — pure transforms.

import type { Tables } from '@mei/types';
import type {
  Combination as ApiCombination,
  CommunityLook,
} from '@mei/types';

// ---------------------------------------------------------------------------
// Combination row + items → API Combination shape
// ---------------------------------------------------------------------------

/** A combination row plus its joined items, ordered by `position`. */
export interface CombinationWithItems {
  row: Tables<'combinations'>;
  items: { item_id: string; position: number }[];
}

export function mapCombination(c: CombinationWithItems): ApiCombination {
  // Sort by position so the OutfitCard always renders the same item order.
  const itemIds = [...c.items]
    .sort((a, b) => a.position - b.position)
    .map((it) => it.item_id);
  return {
    comboId: c.row.combo_id,
    userId: c.row.user_id,
    name: c.row.name,
    itemIds,
    occasionTags: c.row.occasion_tags,
    source: c.row.source,
    createdAt: c.row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Age band — anonymised per §12.6
// ---------------------------------------------------------------------------

/**
 * Convert birth year to a 5-year age band like "25-29".
 * Returns undefined if birth year is missing or implausible.
 *
 * The current year is read at call time so the bands stay accurate without
 * a redeploy each January.
 */
export function ageBandForBirthYear(birthYear: number | null | undefined): string | undefined {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return undefined;
  const now = new Date().getUTCFullYear();
  const age = now - birthYear;
  if (age < 13 || age > 110) return undefined;
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 4}`;
}

// ---------------------------------------------------------------------------
// OOTD post → CommunityLook
// ---------------------------------------------------------------------------

/** A row joined out of `ootd_posts` with its author's profile fields inlined. */
export interface OotdWithOwner {
  ootd_id: string;
  user_id: string;
  try_on_storage_key: string | null;
  fallback_outfit_card_storage_key: string | null;
  created_at: string;
  username: string;
  birth_year: number | null;
  country_code: string | null;
}

/**
 * Resolve a public storage URL for an OOTD post's thumbnail. Public reads
 * on the `ootd` bucket are gated by RLS — for community looks the post is
 * already PUBLIC so a public URL is correct; storing the URL keeps the
 * shape stable even if we later swap to short-lived signed URLs.
 *
 * We assemble the URL inline (rather than calling Supabase's
 * `getPublicUrl`) because the conversion is a deterministic
 * `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` and we
 * don't want to mint a Supabase client just for string concatenation.
 */
export function publicOotdUrl(supabaseUrl: string, storageKey: string): string {
  // Trim trailing slash to keep the result tidy.
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/ootd/${storageKey}`;
}

/**
 * Map a joined OOTD row to the CommunityLook contract shape.
 * `supabaseUrl` is passed in (rather than read from config) so the helper
 * stays unit-testable and we can reuse it inside both /today and the
 * dedicated /today/community-looks endpoint.
 */
export function mapCommunityLook(row: OotdWithOwner, supabaseUrl: string): CommunityLook {
  const key =
    row.try_on_storage_key ?? row.fallback_outfit_card_storage_key ?? null;
  // If neither image key is present we still return the look — the §10.1
  // copy says the strip can render a placeholder. Use a deterministic
  // empty-string fallback URL; downstream code can detect it cheaply.
  const thumbnailUrl = key
    ? publicOotdUrl(supabaseUrl, key)
    : `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/ootd/_placeholder`;
  const look: CommunityLook = {
    ootdId: row.ootd_id,
    userId: row.user_id,
    username: row.username,
    thumbnailUrl,
  };
  const ageBand = ageBandForBirthYear(row.birth_year);
  if (ageBand) look.ageBand = ageBand;
  if (row.country_code) look.countryCode = row.country_code;
  return look;
}

// ---------------------------------------------------------------------------
// Cursor — same opaque base64 `{ offset }` shape as the mock-server, so the
// frontend pages identically against either backend (§7.1).
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
