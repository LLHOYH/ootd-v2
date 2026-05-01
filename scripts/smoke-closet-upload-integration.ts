// scripts/smoke-closet-upload-integration.ts
//
// End-to-end integration smoke for the full closet upload pipeline:
//
//   mobile → api Lambda (POST /closet/items/upload)
//          ←  signed PUT URL + itemId
//   mobile PUT photo → Supabase Storage (closet-raw bucket)
//          (in production: pg_net trigger fires the webhook here.
//           in this smoke: we POST it directly.)
//   image-worker (POST /webhooks/storage)
//   image-worker → vision + process + upload tuned + thumb
//          → row PROCESSING → READY
//   mobile → api Lambda (GET /closet/items)
//          ← row visible with tuned/thumb + populated tags
//
// Pre-reqs:
//   - api running on http://127.0.0.1:3001
//   - image-worker running on http://127.0.0.1:8081

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
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';
const IMAGE_WORKER_URL = process.env.IMAGE_WORKER_URL ?? 'http://127.0.0.1:8081';

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

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/wCgD//Z',
  'base64',
);

async function api<T>(jwt: string, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${jwt}`,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: unknown;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    /* leave undefined */
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  return json as T;
}

async function run() {
  console.log(`\nMei closet-upload integration smoke\n  api:          ${API_URL}\n  image-worker: ${IMAGE_WORKER_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });
  await step('image-worker /health reachable', async () => {
    const r = await fetch(`${IMAGE_WORKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let userId = '';
  let jwt = '';
  await step('admin.createUser + signIn → JWT', async () => {
    const stamp = Date.now();
    const email = `clupload_${stamp}@meitest.local`;
    const password = `pw-${stamp}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Upload Smoke' },
    });
    if (error || !data?.user) throw error ?? new Error('no user');
    userId = data.user.id;
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signin, error: siErr } = await c.auth.signInWithPassword({
      email,
      password,
    });
    if (siErr || !signin.session) throw siErr ?? new Error('no session');
    jwt = signin.session.access_token;
  });

  let itemId = '';
  let signedUploadUrl = '';
  let rawKey = '';

  await step('POST /closet/items/upload (count=1) → signed URL + itemId', async () => {
    const res = await api<{
      items: Array<{ itemId: string; uploadUrl: string; expiresAt: string }>;
    }>(jwt, 'POST', '/closet/items/upload', { count: 1 });
    if (res.items.length !== 1) throw new Error(`got ${res.items.length} items`);
    itemId = res.items[0]!.itemId;
    signedUploadUrl = res.items[0]!.uploadUrl;
    rawKey = `${userId}/${itemId}.jpg`;
    if (!signedUploadUrl.includes(rawKey))
      throw new Error(`signed URL doesn't reference expected path ${rawKey}`);
  });

  await step('row was inserted with status=PROCESSING + raw_storage_key', async () => {
    const { data, error } = await admin
      .from('closet_items')
      .select('status, raw_storage_key')
      .eq('item_id', itemId)
      .single();
    if (error) throw error;
    if (data.status !== 'PROCESSING') throw new Error(`status=${data.status}`);
    if (data.raw_storage_key !== rawKey)
      throw new Error(`raw_storage_key=${data.raw_storage_key} ≠ ${rawKey}`);
  });

  await step('PUT raw photo to signed upload URL', async () => {
    // Supabase signed-upload PUTs require the same x-upsert header the
    // SDK uses — false here since we expect the slot to be empty.
    const r = await fetch(signedUploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
      body: new Uint8Array(TINY_JPEG),
    });
    if (!r.ok) throw new Error(`PUT → ${r.status}: ${await r.text()}`);
  });

  await step('object exists in closet-raw at expected path', async () => {
    const { data, error } = await admin.storage.from('closet-raw').download(rawKey);
    if (error) throw new Error(error.message);
    if (!data || data.size === 0) throw new Error('object empty');
  });

  await step("POST /webhooks/storage → image-worker promotes the row", async () => {
    const r = await fetch(`${IMAGE_WORKER_URL}/webhooks/storage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'INSERT',
        table: 'objects',
        schema: 'storage',
        record: { bucket_id: 'closet-raw', name: rawKey },
      }),
    });
    if (!r.ok) throw new Error(`status ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as { ok: boolean; result?: { status: string } };
    if (body.result?.status !== 'promoted')
      throw new Error(`worker returned status=${body.result?.status}`);
  });

  await step('GET /closet/items via api → row is READY with tuned/thumb URLs', async () => {
    const res = await api<{
      items: Array<{
        itemId: string;
        status: string;
        name: string;
        category: string;
        rawPhotoUrl: string;
        tunedPhotoUrl: string;
        thumbnailUrl: string;
      }>;
    }>(jwt, 'GET', '/closet/items');
    const item = res.items.find((i) => i.itemId === itemId);
    if (!item) throw new Error('item not in list');
    if (item.status !== 'READY') throw new Error(`status=${item.status}`);
    if (!item.tunedPhotoUrl || item.tunedPhotoUrl.length === 0)
      throw new Error('no tunedPhotoUrl');
    if (!item.thumbnailUrl || item.thumbnailUrl.length === 0)
      throw new Error('no thumbnailUrl');
    if (!item.name || item.name.length === 0)
      throw new Error('vision did not populate name');
  });

  // Cleanup
  if (userId) {
    await admin.storage
      .from('closet-raw')
      .remove([rawKey])
      .catch(() => {});
    await admin.storage
      .from('closet-tuned')
      .remove([`${userId}/${itemId}.webp`, `${userId}/${itemId}_thumb.webp`])
      .catch(() => {});
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup: ${error.message}`);
  }

  const failed = steps.filter((s) => !s.pass).length;
  console.log(`\n${steps.length - failed}/${steps.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
