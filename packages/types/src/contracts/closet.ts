// Closet contracts — SPEC.md §7.2 "Closet".

import { z } from 'zod';
import {
  zClosetItem,
  zClothingCategory,
  zItemStatus,
  zOccasion,
  zWeatherTag,
} from '../entities';
import { paginated, zIso, Pagination } from './shared';

// ---------- POST /closet/items/upload ----------
// Returns N presigned PUT URLs for batch upload.

export const UploadItemsBody = z.object({
  count: z.number().int().positive().max(20),
});
export type UploadItemsBody = z.infer<typeof UploadItemsBody>;

export const UploadItemsResponse = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      uploadUrl: z.string().url(),
      expiresAt: zIso,
    }),
  ),
});
export type UploadItemsResponse = z.infer<typeof UploadItemsResponse>;

// ---------- POST /closet/items/{itemId}/process ----------
// Idempotent. Triggers AI processing for an uploaded item.

export const ProcessItemResponse = z.object({
  itemId: z.string(),
  status: zItemStatus,
});
export type ProcessItemResponse = z.infer<typeof ProcessItemResponse>;

// ---------- GET /closet/items ----------
// Query: ?category=&status=&cursor=&limit=

export const ListItemsQuery = Pagination.extend({
  category: zClothingCategory.optional(),
  status: zItemStatus.optional(),
});
export type ListItemsQuery = z.infer<typeof ListItemsQuery>;

export const ListItemsResponse = paginated(zClosetItem);
export type ListItemsResponse = z.infer<typeof ListItemsResponse>;

// ---------- GET /closet/items/{itemId} ----------

export const GetItemResponse = zClosetItem;
export type GetItemResponse = z.infer<typeof GetItemResponse>;

// ---------- PATCH /closet/items/{itemId} ----------

export const UpdateItemBody = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500),
    occasionTags: z.array(zOccasion),
    weatherTags: z.array(zWeatherTag),
    category: zClothingCategory,
  })
  .partial();
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;

export const UpdateItemResponse = zClosetItem;
export type UpdateItemResponse = z.infer<typeof UpdateItemResponse>;

// ---------- DELETE /closet/items/{itemId} ----------
export { EmptyResponse as DeleteItemResponse } from './shared';

// ---------- GET /closet/items/pending-review ----------

export const PendingReviewResponse = z.object({
  items: z.array(zClosetItem),
});
export type PendingReviewResponse = z.infer<typeof PendingReviewResponse>;

// ---------- POST /closet/items/{itemId}/confirm ----------

export const ConfirmItemResponse = zClosetItem;
export type ConfirmItemResponse = z.infer<typeof ConfirmItemResponse>;
