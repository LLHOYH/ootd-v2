// Helpers shared across the Closet domain handlers.
//
// Two responsibilities:
//   1. Map snake_case DB rows from `closet_items` / `combinations` /
//      `combination_items` to the camelCase contract shapes that the
//      `@mei/types` Zod schemas expect. Every field is spelled out
//      explicitly so the supabase-js generic doesn't quietly drop or
//      rename anything.
//   2. Provide the cursor codec the closet list endpoints share with the
//      rest of the API (opaque base64 `{ offset }` per §7.1, matching the
//      mock-server's convention for parity).
//
// Pure transforms — no network calls.

import type {
  ClosetItem,
  Combination,
  Tables,
} from '@mei/types';
import { signDownloadUrl } from '../../lib/storage';

// ---------------------------------------------------------------------------
// closet_items row → API ClosetItem
// ---------------------------------------------------------------------------

/**
 * Map a closet_items row to the API contract shape.
 *
 * The DB stores storage *keys* (path within bucket) but the API contract
 * exposes URLs. While the item is `PROCESSING` the tuned/thumbnail keys
 * are `null` — we surface empty strings so the contract's
 * `z.string()` (non-URL, non-optional) still parses cleanly. The
 * mock-server does the same thing during the upload window.
 *
 * For READY items we'd ideally sign a download URL per call, but that
 * requires async — see `mapClosetItemAsync` below for the surface that
 * actually mints signed URLs. Sync `mapClosetItem` is for paths that
 * don't yet have signed URLs (e.g. immediately after insert during the
 * upload-batch flow, where the row is still PROCESSING and all keys
 * are null).
 */
export function mapClosetItemRaw(row: Tables<'closet_items'>): ClosetItem {
  return {
    itemId: row.item_id,
    userId: row.user_id,
    category: row.category,
    name: row.name,
    description: row.description,
    colors: row.colors,
    ...(row.fabric_guess != null ? { fabricGuess: row.fabric_guess } : {}),
    occasionTags: row.occasion_tags,
    weatherTags: row.weather_tags,
    rawPhotoUrl: '',
    tunedPhotoUrl: '',
    thumbnailUrl: '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Async variant that signs short-lived download URLs for whichever keys
 * are present. The image-worker fills in `tuned_storage_key` and
 * `thumbnail_storage_key` once it finishes the §9.1 pipeline; before
 * then they're null and we surface empty strings.
 *
 * Each signing call is independent — we Promise.all so a closet listing
 * doesn't fan out into N sequential round trips.
 */
export async function mapClosetItem(
  row: Tables<'closet_items'>,
): Promise<ClosetItem> {
  const base = mapClosetItemRaw(row);

  // Use the row's actual storage_key columns rather than recomputing
  // paths via closetRawKey() / closetTunedKey() / thumbnailKey(). Those
  // helpers hardcode the file extension (.jpg / .webp) which is fine
  // for the production image-worker (sharp re-encodes to webp) but
  // fragile to seed scripts or future workers that pick a different
  // extension. The DB column is the source of truth.
  //
  // We swallow signing failures per-key so a stale storage_key (e.g. the
  // row points at an object that's since been deleted) doesn't 500 the
  // whole listing. The UI will render the row without an image, which
  // is the right degraded experience.
  const sign = async (
    bucket: 'closet-raw' | 'closet-tuned',
    path: string,
    set: (url: string) => void,
  ): Promise<void> => {
    try {
      const url = await signDownloadUrl({ bucket, path });
      set(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[closet] signed-URL failed for ${bucket}/${path}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  };

  const tasks: Promise<void>[] = [];
  if (row.raw_storage_key) {
    tasks.push(
      sign('closet-raw', row.raw_storage_key, (u) => {
        base.rawPhotoUrl = u;
      }),
    );
  }
  if (row.tuned_storage_key) {
    tasks.push(
      sign('closet-tuned', row.tuned_storage_key, (u) => {
        base.tunedPhotoUrl = u;
      }),
    );
  }
  if (row.thumbnail_storage_key) {
    tasks.push(
      sign('closet-tuned', row.thumbnail_storage_key, (u) => {
        base.thumbnailUrl = u;
      }),
    );
  }
  await Promise.all(tasks);
  return base;
}

/** Map many closet_items rows to API shape, signing URLs in parallel. */
export function mapClosetItems(
  rows: Tables<'closet_items'>[],
): Promise<ClosetItem[]> {
  return Promise.all(rows.map(mapClosetItem));
}

// ---------------------------------------------------------------------------
// combinations row + items → API Combination
// ---------------------------------------------------------------------------

/** A combination row plus its joined items, ordered by `position`. */
export interface CombinationWithItems {
  row: Tables<'combinations'>;
  items: { item_id: string; position: number }[];
}

export function mapCombination(c: CombinationWithItems): Combination {
  // Sort by position so renderers see a stable item order regardless of
  // the order the DB returned the join rows in.
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
// Cursor — opaque base64 `{ offset }`. Same shape as the mock-server so
// the frontend pages identically against either backend (§7.1).
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
