// Model photo contracts - "Me becomes a model" from uploaded selfies.

import { z } from 'zod';
import { zIso } from './shared.js';

export const zModelPhotoStatus = z.enum(['PENDING', 'READY', 'FAILED']);
export type ModelPhotoStatus = z.infer<typeof zModelPhotoStatus>;

export const zModelPhoto = z.object({
  modelPhotoId: z.string(),
  userId: z.string(),
  status: zModelPhotoStatus,
  sourceSelfieIds: z.array(z.string()),
  imageUrl: z.string().url().optional(),
  errorDetail: z.string().optional(),
  createdAt: zIso,
  completedAt: zIso.optional(),
});
export type ModelPhoto = z.infer<typeof zModelPhoto>;

export const CreateModelPhotoBody = z.object({
  selfieIds: z.array(z.string()).min(1).max(5).optional(),
}).optional();
export type CreateModelPhotoBody = z.infer<typeof CreateModelPhotoBody>;

export const CreateModelPhotoResponse = zModelPhoto;
export type CreateModelPhotoResponse = z.infer<typeof CreateModelPhotoResponse>;

export const GetModelPhotoResponse = z.object({
  latest: zModelPhoto.optional(),
});
export type GetModelPhotoResponse = z.infer<typeof GetModelPhotoResponse>;
