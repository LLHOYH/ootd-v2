// scripts/smoke-notifier-flow.ts
//
// End-to-end smoke for the notifier (SPEC §3.1, §7.3).
//
//   1. Sign up users A + B; register a push token for B.
//   2. POST each NotificationEvent variant for recipient B → assert the
//      response receipts target B's token, with mock=true.
//   3. POST an event for a user with no tokens → assert status=no-tokens.
//   4. POST a malformed payload → assert ok=false + reason=validation.
//   5. Cleanup admin.deleteUser × 2.
//
// Pre-req: notifier running on http://127.0.0.1:8082 in mock mode.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path: string): Record<string, string> {
  const raw = readFileSync(path, 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv(resolve(__dirname, '..', 'services', 'api', '.env'));
const SUPABASE_URL = env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
const NOTIFIER_URL = process.env.NOTIFIER_URL ?? 'http://127.0.0.1:8082';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Step = { name: string; pass: boolean; detail?: string };
const steps: Step[] = [];
function record(name: string, pass: boolean, detail?: string) {
  steps.push({ name, pass, detail });
  console.log(
    `${pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${name}${
      detail ? `  — ${detail}` : ''
    }`,
  );
}
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const v = await fn();
    record(name, true);
    return v;
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    record(name, false, msg);
    return null;
  }
}

interface FireResult {
  ok: boolean;
  reason?: string;
  result?: {
    status: 'sent' | 'no-tokens' | 'failed';
    recipientUserId: string;
    type: string;
    receipts: Array<{ ok: boolean; to: string; detail: unknown }>;
    detail?: string;
  };
}

async function fire(payload: unknown): Promise<FireResult> {
  const r = await fetch(`${NOTIFIER_URL}/webhooks/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await r.json()) as FireResult;
}

async function run() {
  console.log(`\nMei notifier smoke — ${NOTIFIER_URL}\n`);

  await step('notifier /health reachable', async () => {
    const r = await fetch(`${NOTIFIER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let aId = '';
  let bId = '';
  const stamp = Date.now();
  const bToken = `ExponentPushToken[mock-${stamp}]`;

  await step('create users A + B', async () => {
    const a = await admin.auth.admin.createUser({
      email: `notif_a_${stamp}@meitest.local`,
      password: `pw-${stamp}`,
      email_confirm: true,
      user_metadata: { display_name: 'Alice Notif' },
    });
    if (a.error || !a.data.user) throw a.error ?? new Error('a missing');
    aId = a.data.user.id;
    const b = await admin.auth.admin.createUser({
      email: `notif_b_${stamp}@meitest.local`,
      password: `pw-${stamp}`,
      email_confirm: true,
      user_metadata: { display_name: 'Bea Notif' },
    });
    if (b.error || !b.data.user) throw b.error ?? new Error('b missing');
    bId = b.data.user.id;
  });

  await step('register push token for B (one device, ios)', async () => {
    const { error } = await admin
      .from('push_tokens')
      .insert({ user_id: bId, token: bToken, platform: 'ios' });
    if (error) throw error;
  });

  await step('FRIEND_REQUEST → mock receipt for B\'s token', async () => {
    const res = await fire({
      type: 'FRIEND_REQUEST',
      recipientUserId: bId,
      fromUserId: aId,
      fromDisplayName: 'Alice Notif',
    });
    if (!res.ok) throw new Error(`reason=${res.reason}`);
    if (res.result?.status !== 'sent') throw new Error(`status=${res.result?.status}`);
    if (res.result.receipts.length !== 1)
      throw new Error(`receipts=${res.result.receipts.length}`);
    if (res.result.receipts[0]!.to !== bToken)
      throw new Error('wrong token targeted');
    if (!res.result.receipts[0]!.ok) throw new Error('receipt not ok');
  });

  await step('FRIEND_ACCEPTED → sent', async () => {
    const res = await fire({
      type: 'FRIEND_ACCEPTED',
      recipientUserId: bId,
      acceptedByUserId: aId,
      acceptedByDisplayName: 'Alice Notif',
    });
    if (res.result?.status !== 'sent') throw new Error(`status=${res.result?.status}`);
  });

  await step('CHAT_MESSAGE → sent (preview present)', async () => {
    const res = await fire({
      type: 'CHAT_MESSAGE',
      recipientUserId: bId,
      threadId: '00000000-0000-0000-0000-000000000001',
      senderUserId: aId,
      senderDisplayName: 'Alice Notif',
      preview: 'hi from smoke',
    });
    if (res.result?.status !== 'sent') throw new Error(`status=${res.result?.status}`);
  });

  await step('OOTD_REACTION → sent', async () => {
    const res = await fire({
      type: 'OOTD_REACTION',
      recipientUserId: bId,
      ootdId: '00000000-0000-0000-0000-000000000002',
      reactorUserId: aId,
      reactorDisplayName: 'Alice Notif',
    });
    if (res.result?.status !== 'sent') throw new Error(`status=${res.result?.status}`);
  });

  await step('event for user with no tokens → no-tokens', async () => {
    const res = await fire({
      type: 'FRIEND_REQUEST',
      recipientUserId: aId, // A has no token registered
      fromUserId: bId,
      fromDisplayName: 'Bea Notif',
    });
    if (res.result?.status !== 'no-tokens')
      throw new Error(`status=${res.result?.status}`);
    if (res.result.receipts.length !== 0)
      throw new Error('expected zero receipts');
  });

  await step('malformed payload → ok=false + validation reason', async () => {
    const res = await fire({ type: 'NOT_A_REAL_TYPE', recipientUserId: bId });
    if (res.ok !== false) throw new Error('expected ok=false');
    if (res.reason !== 'validation') throw new Error(`reason=${res.reason}`);
  });

  await step('multi-device fan-out: register a 2nd token for B', async () => {
    const t2 = `ExponentPushToken[mock2-${stamp}]`;
    const { error } = await admin
      .from('push_tokens')
      .insert({ user_id: bId, token: t2, platform: 'android' });
    if (error) throw error;
    const res = await fire({
      type: 'CHAT_MESSAGE',
      recipientUserId: bId,
      threadId: '00000000-0000-0000-0000-000000000001',
      senderUserId: aId,
      senderDisplayName: 'Alice Notif',
      preview: 'multi-device',
    });
    if (res.result?.status !== 'sent') throw new Error(`status=${res.result?.status}`);
    if (res.result.receipts.length !== 2)
      throw new Error(`receipts=${res.result.receipts.length}, expected 2`);
    const targets = new Set(res.result.receipts.map((r) => r.to));
    if (!targets.has(bToken) || !targets.has(t2))
      throw new Error('both tokens should have been targeted');
  });

  // Cleanup
  for (const id of [aId, bId]) {
    if (id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup ${id}: ${error.message}`);
    }
  }

  const failed = steps.filter((s) => !s.pass).length;
  console.log(`\n${steps.length - failed}/${steps.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
