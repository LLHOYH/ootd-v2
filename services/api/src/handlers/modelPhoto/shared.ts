import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ModelPhoto,
  type ModelPhotoStatus,
} from '@mei/types';
import { signDownloadUrl } from '../../lib/storage';

export interface ModelPhotoRow {
  model_photo_id: string;
  user_id: string;
  source_selfie_ids: string[] | null;
  status: ModelPhotoStatus;
  storage_key: string | null;
  provider_id: string | null;
  error_detail: string | null;
  prompt_version: string;
  created_at: string;
  completed_at: string | null;
}

export async function mapModelPhoto(row: ModelPhotoRow): Promise<ModelPhoto> {
  const out: ModelPhoto = {
    modelPhotoId: row.model_photo_id,
    userId: row.user_id,
    status: row.status,
    sourceSelfieIds: row.source_selfie_ids ?? [],
    createdAt: row.created_at,
  };
  if (row.completed_at) out.completedAt = row.completed_at;
  if (row.error_detail) out.errorDetail = row.error_detail;
  if (row.status === 'READY' && row.storage_key) {
    try {
      out.imageUrl = await signDownloadUrl({
        bucket: 'model-photos',
        path: row.storage_key,
      });
    } catch {
      // Leave imageUrl undefined; the app renders the non-ready state.
    }
  }
  return out;
}

export async function readLatestModelPhoto(
  supabase: SupabaseClient,
  userId: string,
): Promise<ModelPhotoRow | null> {
  const { data, error } = await supabase
    .from('model_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`model photo lookup failed: ${error.message}`);
  }
  return ((data ?? []) as ModelPhotoRow[])[0] ?? null;
}
