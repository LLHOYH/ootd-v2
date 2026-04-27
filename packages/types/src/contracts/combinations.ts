// Combinations contracts — SPEC.md §7.2 "Combinations".

import { z } from 'zod';
import { zCombination, zComboSource, zOccasion } from '../entities.js';
import { paginated, Pagination } from './shared.js';

// ---------- GET /closet/combinations ----------

export const ListCombinationsQuery = Pagination;
export type ListCombinationsQuery = z.infer<typeof ListCombinationsQuery>;

export const ListCombinationsResponse = paginated(zCombination);
export type ListCombinationsResponse = z.infer<typeof ListCombinationsResponse>;

// ---------- POST /closet/combinations ----------

export const CreateCombinationBody = z.object({
  name: z.string().min(1).max(120).optional(),
  itemIds: z.array(z.string()).min(2).max(6),
  occasionTags: z.array(zOccasion).optional(),
  source: zComboSource,
});
export type CreateCombinationBody = z.infer<typeof CreateCombinationBody>;

export const CreateCombinationResponse = zCombination;
export type CreateCombinationResponse = z.infer<typeof CreateCombinationResponse>;

// ---------- GET /closet/combinations/{comboId} ----------

export const GetCombinationResponse = zCombination;
export type GetCombinationResponse = z.infer<typeof GetCombinationResponse>;

// ---------- PATCH /closet/combinations/{comboId} ----------

export const UpdateCombinationBody = z
  .object({
    name: z.string().min(1).max(120),
    itemIds: z.array(z.string()).min(2).max(6),
    occasionTags: z.array(zOccasion),
  })
  .partial();
export type UpdateCombinationBody = z.infer<typeof UpdateCombinationBody>;

export const UpdateCombinationResponse = zCombination;
export type UpdateCombinationResponse = z.infer<typeof UpdateCombinationResponse>;

// ---------- DELETE /closet/combinations/{comboId} ----------
export { EmptyResponse as DeleteCombinationResponse } from './shared.js';
