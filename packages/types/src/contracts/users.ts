// Public profile contracts — SPEC.md §7.2 "Public profile".

import { z } from 'zod';
import { zOOTDPost } from '../entities';
import { paginated, Pagination } from './shared';

// ---------- GET /users/{userId} ----------
// Returns 404 if not discoverable and not friends.

export const PublicProfile = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().optional(),
  city: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  stylePreferences: z.array(z.string()),
  isFriend: z.boolean(),
  hasOutgoingRequest: z.boolean(),
  hasIncomingRequest: z.boolean(),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

export const GetPublicProfileResponse = PublicProfile;
export type GetPublicProfileResponse = z.infer<typeof GetPublicProfileResponse>;

// ---------- GET /users/{userId}/ootds ----------

export const ListUserOotdsQuery = Pagination;
export type ListUserOotdsQuery = z.infer<typeof ListUserOotdsQuery>;

export const ListUserOotdsResponse = paginated(zOOTDPost);
export type ListUserOotdsResponse = z.infer<typeof ListUserOotdsResponse>;
