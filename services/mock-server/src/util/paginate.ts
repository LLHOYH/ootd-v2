// Cursor pagination helper. Cursor is a base64-encoded JSON `{ offset: number }`.
// Per SPEC.md §7.1: opaque, URL-safe, list endpoints accept ?cursor=&limit=.

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

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
}

/** Paginate over an in-memory array using opaque cursors. */
export function paginate<T>(
  source: T[],
  cursor: string | undefined,
  limit: number | undefined,
): PaginatedResult<T> {
  const { offset } = decodeCursor(cursor);
  const pageSize = Math.min(Math.max(limit ?? 20, 1), 100);
  const slice = source.slice(offset, offset + pageSize);
  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < source.length;
  const result: PaginatedResult<T> = { items: slice };
  if (hasMore) result.nextCursor = encodeCursor({ offset: nextOffset });
  return result;
}
