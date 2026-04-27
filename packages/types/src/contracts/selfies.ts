// Selfies contracts — SPEC.md §7.2 "Selfies".

import { z } from 'zod';
import { zSelfie } from '../entities.js';
import { zIso } from './shared.js';

// ---------- POST /me/selfies ----------
// Returns a presigned PUT URL; client uploads directly to S3.

export const CreateSelfieBody = z.object({
  contentType: z.string().regex(/^image\//).optional(),
});
export type CreateSelfieBody = z.infer<typeof CreateSelfieBody>;

export const CreateSelfieResponse = z.object({
  selfieId: z.string(),
  uploadUrl: z.string().url(),
  expiresAt: zIso,
});
export type CreateSelfieResponse = z.infer<typeof CreateSelfieResponse>;

// ---------- GET /me/selfies ----------
// Metadata only — never URLs (selfies are SSE-KMS, never via CDN).

export const ListSelfiesResponse = z.object({
  items: z.array(zSelfie),
});
export type ListSelfiesResponse = z.infer<typeof ListSelfiesResponse>;

// ---------- DELETE /me/selfies/{selfieId} ----------
// No body. Empty response.
export { EmptyResponse as DeleteSelfieResponse } from './shared.js';
