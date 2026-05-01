// POST /webhooks/storage
//
// Accepts Supabase Storage / pg_net database-webhook payloads for the
// `closet-raw` bucket. The webhook is configured in Supabase as a Postgres
// trigger on `storage.objects` filtered to bucket_id = 'closet-raw';
// see the migration that lands alongside this PR.
//
// Two payload shapes are accepted to keep tests simple:
//
//   1. Database webhook (the production shape):
//        {
//          type: 'INSERT',
//          table: 'objects',
//          schema: 'storage',
//          record: { bucket_id: 'closet-raw', name: '<userId>/<itemId>.jpg', ... },
//          old_record: null,
//        }
//
//   2. Direct test shape (for local smokes; same bucket implied):
//        { bucketId, objectKey, userId?, itemId? }
//
// The route returns 200 on every recognised payload — even when the row
// is missing or already promoted — so Storage doesn't keep retrying.
//
// Auth: if `IMAGE_WORKER_WEBHOOK_SECRET` is set, the request must include
// an `x-webhook-secret` header equal to the secret. Local-dev convenience:
// when the secret is unset, we accept everything.

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageWorkerConfig } from '../config';
import { promoteClosetItem } from '../pipeline/promoteClosetItem';
import { BUCKET_RAW, parseRawObjectKey } from '../lib/storage';

interface WebhookOptions {
  config: ImageWorkerConfig;
  supabase: SupabaseClient;
}

interface DatabaseWebhookBody {
  type?: string;
  table?: string;
  schema?: string;
  record?: { bucket_id?: string; name?: string };
}

interface DirectWebhookBody {
  bucketId?: string;
  objectKey?: string;
  userId?: string;
  itemId?: string;
}

type WebhookBody = (DatabaseWebhookBody & DirectWebhookBody) | undefined;

function verifySecret(req: FastifyRequest, expected: string | undefined): boolean {
  if (!expected || expected.length === 0) return true; // dev mode
  const got = (req.headers['x-webhook-secret'] as string | undefined) ?? '';
  return got === expected;
}

interface ResolvedTarget {
  bucketId: string;
  objectKey: string;
  userId: string;
  itemId: string;
}

function resolveTarget(body: WebhookBody): ResolvedTarget | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'empty body' };

  // Database webhook shape — preferred.
  const record = body.record;
  if (record && typeof record === 'object') {
    const bucketId = record.bucket_id;
    const objectKey = record.name;
    if (bucketId && objectKey) {
      const parsed = parseRawObjectKey(objectKey);
      if (!parsed) return { error: `unparseable object key: ${objectKey}` };
      return { bucketId, objectKey, userId: parsed.userId, itemId: parsed.itemId };
    }
  }

  // Direct test shape.
  if (body.bucketId && body.objectKey) {
    const parsed =
      body.userId && body.itemId
        ? { userId: body.userId, itemId: body.itemId }
        : parseRawObjectKey(body.objectKey);
    if (!parsed) return { error: `unparseable object key: ${body.objectKey}` };
    return {
      bucketId: body.bucketId,
      objectKey: body.objectKey,
      userId: parsed.userId,
      itemId: parsed.itemId,
    };
  }

  return { error: 'no record or bucketId/objectKey provided' };
}

export const storageWebhookRoute: FastifyPluginAsync<WebhookOptions> = async (
  app: FastifyInstance,
  opts: WebhookOptions,
) => {
  const { config: cfg, supabase } = opts;

  app.post<{ Body: WebhookBody }>(
    '/webhooks/storage',
    async (req, reply) => {
      // Auth.
      if (!verifySecret(req, cfg.webhookSecret)) {
        return reply.status(401).send({
          error: { code: 'UNAUTHENTICATED', message: 'Bad webhook secret' },
        });
      }

      const target = resolveTarget(req.body);
      if ('error' in target) {
        req.log.warn({ err: target.error }, 'webhook payload not actionable');
        // Return 200 so Storage doesn't retry — bad payloads won't get
        // better with a retry.
        return reply.status(200).send({ ok: false, reason: target.error });
      }

      // We only care about `closet-raw` here. Other buckets (selfies,
      // ootd) will land in their own routes once they need post-upload
      // processing.
      if (target.bucketId !== BUCKET_RAW) {
        req.log.info(
          { bucket: target.bucketId, objectKey: target.objectKey },
          'webhook for non-closet-raw bucket — ignoring',
        );
        return reply.status(200).send({ ok: true, ignored: true });
      }

      const result = await promoteClosetItem(
        cfg,
        supabase,
        {
          userId: target.userId,
          itemId: target.itemId,
          rawStorageKey: target.objectKey,
        },
        req.log as unknown as {
          info: (m: string, ctx?: object) => void;
          warn: (m: string, ctx?: object) => void;
          error: (m: string, ctx?: object) => void;
        },
      );

      return reply.status(200).send({ ok: true, result });
    },
  );
};
