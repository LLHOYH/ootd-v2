// OOTD contracts — SPEC.md §7.2 "OOTD".

import { z } from 'zod';
import { zCombination, zOOTDPost, zOOTDVisibility } from '../entities.js';
import { paginated, Pagination } from './shared.js';

// ---------- POST /ootd ----------
// Try-on photo generates async; response returns ootdId + status.

export const CreateOotdBody = z
  .object({
    comboId: z.string(),
    caption: z.string().max(280).optional(),
    locationName: z.string().max(120).optional(),
    visibility: zOOTDVisibility,
    visibilityTargets: z.array(z.string()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.visibility !== 'PUBLIC' && val.visibility !== 'FRIENDS') {
      if (!val.visibilityTargets || val.visibilityTargets.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'visibilityTargets required when visibility is GROUP or DIRECT',
          path: ['visibilityTargets'],
        });
      }
    }
  });
export type CreateOotdBody = z.infer<typeof CreateOotdBody>;

export const CreateOotdResponse = z.object({
  ootdId: z.string(),
  status: z.enum(['PROCESSING', 'READY']),
});
export type CreateOotdResponse = z.infer<typeof CreateOotdResponse>;

// ---------- GET /ootd/feed ----------

export const OotdFeedQuery = Pagination;
export type OotdFeedQuery = z.infer<typeof OotdFeedQuery>;

export const OotdFeedResponse = paginated(zOOTDPost);
export type OotdFeedResponse = z.infer<typeof OotdFeedResponse>;

// ---------- GET /ootd/{ootdId} ----------

export const GetOotdResponse = zOOTDPost;
export type GetOotdResponse = z.infer<typeof GetOotdResponse>;

// ---------- DELETE /ootd/{ootdId} ----------
export { EmptyResponse as DeleteOotdResponse } from './shared.js';

// ---------- POST /ootd/{ootdId}/react ----------

export const ReactOotdBody = z
  .object({
    type: z.literal('♡').optional(),
  })
  .optional();
export type ReactOotdBody = z.infer<typeof ReactOotdBody>;

export const ReactOotdResponse = z.object({
  ootdId: z.string(),
  reactionCount: z.number().int().nonnegative(),
});
export type ReactOotdResponse = z.infer<typeof ReactOotdResponse>;

// ---------- DELETE /ootd/{ootdId}/react ----------

export const UnreactOotdResponse = z.object({
  ootdId: z.string(),
  reactionCount: z.number().int().nonnegative(),
});
export type UnreactOotdResponse = z.infer<typeof UnreactOotdResponse>;

// ---------- POST /ootd/{ootdId}/coordinate ----------
// Trigger Stella to suggest a coordinating outfit from my closet.

export const CoordinateOotdResponse = z.object({
  suggestion: zCombination,
  rationale: z.string().optional(),
});
export type CoordinateOotdResponse = z.infer<typeof CoordinateOotdResponse>;
