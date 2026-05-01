// POST /webhooks/notify
//
// Accepts a typed NotificationEvent (see ./pipeline/dispatch). In
// production the upstream is `pg_net` calling this endpoint from a
// Postgres trigger (one trigger per source table — friend_requests,
// friendships, chat_messages, ootd_reactions). For local-dev smokes
// the script POSTs directly.
//
// Auth: optional shared secret in `x-webhook-secret`. Unset = local mode.

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotifierConfig } from '../config';
import { NotificationEvent, dispatchNotification } from '../pipeline/dispatch';

interface RouteOptions {
  config: NotifierConfig;
  supabase: SupabaseClient;
}

function verifySecret(req: FastifyRequest, expected: string | undefined): boolean {
  if (!expected || expected.length === 0) return true;
  const got = (req.headers['x-webhook-secret'] as string | undefined) ?? '';
  return got === expected;
}

export const notifyRoute: FastifyPluginAsync<RouteOptions> = async (
  app: FastifyInstance,
  opts: RouteOptions,
) => {
  const { config: cfg, supabase } = opts;

  app.post('/webhooks/notify', async (req, reply) => {
    if (!verifySecret(req, cfg.webhookSecret)) {
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Bad webhook secret' },
      });
    }

    const parsed = NotificationEvent.safeParse(req.body);
    if (!parsed.success) {
      // Bad payloads won't get better with a retry — return 200 + the
      // validation issues so pg_net stops, but the source is debuggable.
      req.log.warn(
        { issues: parsed.error.issues },
        'webhook payload failed validation',
      );
      return reply.status(200).send({
        ok: false,
        reason: 'validation',
        issues: parsed.error.issues,
      });
    }

    const result = await dispatchNotification(
      cfg,
      supabase,
      parsed.data,
      req.log as unknown as {
        info: (m: string, ctx?: object) => void;
        warn: (m: string, ctx?: object) => void;
        error: (m: string, ctx?: object) => void;
      },
    );

    return reply.status(200).send({ ok: true, result });
  });
};
