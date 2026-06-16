// Try-on contracts — SPEC §10.10 (Wear-this) generation flow.
//
// Two HTTP endpoints back this surface:
//
//   POST /tryon             — create or reuse a generation. Async in v1:
//                             returns READY if cached, otherwise a PENDING
//                             row queued for the image-worker.
//   GET  /tryon/{id}        — read a generation by id. Used to surface
//                             cached results on re-tap of the same
//                             (selfie/model, combo) pair and as the polling
//                             target for queued generations.

import { z } from 'zod';
import { zIso } from './shared.js';

export const zTryonStatus = z.enum(['PENDING', 'READY', 'FAILED']);
export type TryonStatus = z.infer<typeof zTryonStatus>;

/** One try-on generation row + a signed display URL when ready. */
export const zTryonGeneration = z.object({
  generationId: z.string(),
  userId: z.string(),
  selfieId: z.string(),
  comboId: z.string(),
  /** The single item within `comboId` that was the garment input. v1
   *  picks one per generation; v2 may chain multiple passes. */
  itemId: z.string(),
  status: zTryonStatus,
  /** Short-lived signed URL for the generated image when status='READY'.
   *  Undefined while pending or on failure. */
  imageUrl: z.string().url().optional(),
  /** Short error string when status='FAILED'. */
  errorDetail: z.string().optional(),
  createdAt: zIso,
  completedAt: zIso.optional(),
});
export type TryonGeneration = z.infer<typeof zTryonGeneration>;

// ---------- POST /tryon ----------

export const CreateTryonBody = z.object({
  comboId: z.string(),
  /** Optional — caller can pin a specific selfie. Server defaults to the
   *  caller's most-recently uploaded selfie if omitted. */
  selfieId: z.string().optional(),
});
export type CreateTryonBody = z.infer<typeof CreateTryonBody>;

export const CreateTryonResponse = zTryonGeneration;
export type CreateTryonResponse = z.infer<typeof CreateTryonResponse>;

// ---------- GET /tryon/{id} ----------

export const GetTryonResponse = zTryonGeneration;
export type GetTryonResponse = z.infer<typeof GetTryonResponse>;
