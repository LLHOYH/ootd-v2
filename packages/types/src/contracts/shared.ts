// Shared contract building blocks: error envelope, pagination helper,
// and small primitive helpers used across all route families.
// Source of truth: SPEC.md §7.1.

import { z } from 'zod';

// ---------- Primitive helpers ----------

/** ISO-8601 timestamp with timezone offset. */
export const zIso = z.string().datetime({ offset: true });

/** UUID v4 (loose: also accepts other UUID variants). */
export const zUuid = z.string().uuid();

/** Opaque, URL-safe pagination cursor. */
export const zCursor = z.string().min(1);

/** Positive integer page size. */
export const zLimit = z.number().int().positive().max(100);

// ---------- Error envelope (SPEC §7.1) ----------

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

// ---------- Pagination (SPEC §7.1) ----------

/** Cursor query params accepted on any list endpoint. */
export const Pagination = z.object({
  cursor: zCursor.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type Pagination = z.infer<typeof Pagination>;

/**
 * Generic paginated-response builder.
 *
 * Usage:
 *   const ListItemsResponse = paginated(zClosetItem);
 *   type ListItemsResponse = z.infer<typeof ListItemsResponse>;
 */
export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: zCursor.optional(),
  });

/** Convenience: empty response shape (used by deletes, marks-as-read, etc.). */
export const EmptyResponse = z.object({}).strict();
export type EmptyResponse = z.infer<typeof EmptyResponse>;

/** Convenience: `{ ok: true }` response shape. */
export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;
