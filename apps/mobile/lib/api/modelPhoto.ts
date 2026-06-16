// Typed wrappers for the api Lambda's `/model-photo` domain.

import type {
  CreateModelPhotoBody,
  CreateModelPhotoResponse,
  GetModelPhotoResponse,
} from '@mei/types';
import { apiFetch } from './client';

export function fetchLatestModelPhoto(
  opts: { signal?: AbortSignal } = {},
): Promise<GetModelPhotoResponse> {
  return apiFetch<GetModelPhotoResponse>('/model-photo', { signal: opts.signal });
}

export function createModelPhoto(
  body?: CreateModelPhotoBody,
  opts: { signal?: AbortSignal } = {},
): Promise<CreateModelPhotoResponse> {
  return apiFetch<CreateModelPhotoResponse>('/model-photo', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}
