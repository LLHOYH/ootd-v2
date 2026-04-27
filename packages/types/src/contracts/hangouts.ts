// Hangouts contracts — SPEC.md §7.2 "Hangouts".

import { z } from 'zod';
import { zHangout, zHangoutMember } from '../entities.js';
import { zIso } from './shared.js';

// ---------- POST /hangouts ----------

export const CreateHangoutBody = z.object({
  name: z.string().min(1).max(120),
  startsAt: zIso,
  locationName: z.string().max(200).optional(),
  memberIds: z.array(z.string()).min(1).max(50),
});
export type CreateHangoutBody = z.infer<typeof CreateHangoutBody>;

export const CreateHangoutResponse = z.object({
  hangout: zHangout,
  members: z.array(zHangoutMember),
});
export type CreateHangoutResponse = z.infer<typeof CreateHangoutResponse>;

// ---------- GET /hangouts ----------
// Active + recent hangouts.

export const ListHangoutsResponse = z.object({
  active: z.array(zHangout),
  recent: z.array(zHangout),
});
export type ListHangoutsResponse = z.infer<typeof ListHangoutsResponse>;

// ---------- GET /hangouts/{hangoutId} ----------

export const GetHangoutResponse = z.object({
  hangout: zHangout,
  members: z.array(zHangoutMember),
});
export type GetHangoutResponse = z.infer<typeof GetHangoutResponse>;

// ---------- PATCH /hangouts/{hangoutId} ----------

export const UpdateHangoutBody = z
  .object({
    name: z.string().min(1).max(120),
    startsAt: zIso,
    locationName: z.string().max(200),
  })
  .partial();
export type UpdateHangoutBody = z.infer<typeof UpdateHangoutBody>;

export const UpdateHangoutResponse = zHangout;
export type UpdateHangoutResponse = z.infer<typeof UpdateHangoutResponse>;

// ---------- POST /hangouts/{hangoutId}/expire ----------

export const ExpireHangoutResponse = zHangout;
export type ExpireHangoutResponse = z.infer<typeof ExpireHangoutResponse>;

// ---------- POST /hangouts/{hangoutId}/share ----------

export const ShareHangoutOutfitBody = z.object({
  comboId: z.string(),
});
export type ShareHangoutOutfitBody = z.infer<typeof ShareHangoutOutfitBody>;

export const ShareHangoutOutfitResponse = z.object({
  member: zHangoutMember,
});
export type ShareHangoutOutfitResponse = z.infer<typeof ShareHangoutOutfitResponse>;

// ---------- POST /hangouts/{hangoutId}/leave ----------
export { EmptyResponse as LeaveHangoutResponse } from './shared.js';

// ---------- DELETE /hangouts/{hangoutId} ----------
// Owner-only cancel.
export { EmptyResponse as CancelHangoutResponse } from './shared.js';
