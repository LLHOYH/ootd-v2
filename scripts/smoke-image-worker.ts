// scripts/smoke-image-worker.ts
//
// End-to-end smoke for the image-worker closet-promotion pipeline (SPEC §9.1).
//
//   1. Sign up a user; insert a closet_items row with status=PROCESSING and
//      a raw_storage_key — mirrors what the api Lambda's POST /closet/items
//      will do once the upload UI is wired.
//   2. Upload a small synthetic JPEG to `closet-raw/{userId}/{itemId}.jpg`
//      via the service-role client.
//   3. POST the database-webhook payload to the worker's
//      /webhooks/storage endpoint (direct shape — bypasses pg_net for
//      local-only testing).
//   4. Poll the row until status flips to READY (or 30s timeout).
//   5. Assert the row now has tuned_storage_key + thumbnail_storage_key,
//      and that both objects exist in `closet-tuned`.
//   6. Idempotency: re-fire the webhook → worker reports `already-ready`,
//      row stays READY.
//   7. Cleanup admin.deleteUser (cascades closet_items + storage objects
//      we created).
//
// Pre-reqs:
//   - image-worker running on http://127.0.0.1:8081
//     (pnpm --filter @mei/image-worker start, env from services/image-worker/.env)

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

// A tiny but valid JPEG (1x1 cream pixel). Enough for sharp to read.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/wCgD//Z',
  'base64',
);

async function run() {
  console.log(`\nMei image-worker smoke — ${IMAGE_WORKER_URL}\n`);

  await step('image-worker /health reachable', async () => {
    const r = await fetch(`${IMAGE_WORKER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let userId = '';
  let itemId = '';
  let rawKey = '';

  await step('admin.createUser', async () => {
    const stamp = Date.now();
    const email = `imgworker_${stamp}@meitest.local`;
    const password = `pw-${stamp}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Image Smoke' },
    });
    if (error || !data?.user) throw error ?? new Error('no user');
    userId = data.user.id;
  });

  await step('insert closet_items row (status=PROCESSING)', async () => {
    const { data, error } = await admin
      .from('closet_items')
      .insert({
        user_id: userId,
        category: 'TOP',
        name: '',
        description: '',
        status: 'PROCESSING',
        raw_storage_key: '', // filled below
      })
      .select('item_id')
      .single();
    if (error) throw error;
    itemId = data.item_id;
    rawKey = `${userId}/${itemId}.jpg`;
    const { error: u } = await admin
      .from('closet_items')
      .update({ raw_storage_key: rawKey })
      .eq('item_id', itemId);
    if (u) throw u;
  });

  await step('upload tiny JPEG to closet-raw', async () => {
    const { error } = await admin.storage
      .from('closet-raw')
      .upload(rawKey, TINY_JPEG, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  });

  await step('POST /webhooks/storage → 200 + result.status=promoted', async () => {
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
    if (!body.ok) throw new Error('ok=false');
    if (body.result?.status !== 'promoted')
      throw new Error(`status=${body.result?.status}`);
  });

  await step('row flipped to READY with tuned + thumb keys', async () => {
    const { data, error } = await admin
      .from('closet_items')
      .select(
        'status, tuned_storage_key, thumbnail_storage_key, name, description, category',
      )
      .eq('item_id', itemId)
      .single();
    if (error) throw error;
    if (data.status !== 'READY') throw new Error(`status=${data.status}`);
    if (!data.tuned_storage_key) throw new Error('no tuned_storage_key');
    if (!data.thumbnail_storage_key) throw new Error('no thumbnail_storage_key');
    // Mock vision wrote a category + name (since name was '' on insert).
    if (!data.name || data.name.length === 0)
      throw new Error('vision did not populate name');
  });

  await step('tuned + thumb objects exist in closet-tuned bucket', async () => {
    const tunedKey = `${userId}/${itemId}.webp`;
    const thumbKey = `${userId}/${itemId}_thumb.webp`;
    const tuned = await admin.storage.from('closet-tuned').download(tunedKey);
    if (tuned.error) throw new Error(`tuned download: ${tuned.error.message}`);
    if (!tuned.data || tuned.data.size === 0) throw new Error('tuned empty');
    const thumb = await admin.storage.from('closet-tuned').download(thumbKey);
    if (thumb.error) throw new Error(`thumb download: ${thumb.error.message}`);
    if (!thumb.data || thumb.data.size === 0) throw new Error('thumb empty');
  });

  await step('idempotency: re-fire webhook → already-ready', async () => {
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
    const body = (await r.json()) as { result?: { status: string } };
    if (body.result?.status !== 'already-ready')
      throw new Error(`status=${body.result?.status}`);
  });

  await step('non-closet bucket payload is ignored cleanly', async () => {
    const r = await fetch(`${IMAGE_WORKER_URL}/webhooks/storage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'INSERT',
        record: { bucket_id: 'selfies', name: `${userId}/somekey.jpg` },
      }),
    });
    const body = (await r.json()) as { ok: boolean; ignored?: boolean };
    if (!body.ignored) throw new Error('expected ignored=true');
  });

  await step('webhook for unknown item_id returns no-row (graceful)', async () => {
    const fakeKey = `${userId}/00000000-0000-0000-0000-000000000000.jpg`;
    // Need to actually upload something so download succeeds — but the row
    // will be missing. Actually the row lookup happens before download, so
    // we can skip the upload.
    const r = await fetch(`${IMAGE_WORKER_URL}/webhooks/storage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'INSERT',
        record: { bucket_id: 'closet-raw', name: fakeKey },
      }),
    });
    const body = (await r.json()) as { result?: { status: string } };
    if (body.result?.status !== 'no-row')
      throw new Error(`status=${body.result?.status}`);
  });

  // Cleanup
  if (userId) {
    // The closet-raw + closet-tuned objects we created are owned by this
    // user; auth.admin.deleteUser cascades public.users → closet_items
    // (via FK). Storage objects don't auto-cascade, so remove them too.
    await admin.storage
      .from('closet-raw')
      .remove([rawKey])
      .catch(() => {});
    await admin.storage
      .from('closet-tuned')
      .remove([
        `${userId}/${itemId}.webp`,
        `${userId}/${itemId}_thumb.webp`,
      ])
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
