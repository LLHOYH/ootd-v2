// scripts/smoke-craft-look.ts
//
// End-to-end smoke for Craft a look (the new app/craft-a-look modal).
// Mirrors what the mobile flow does:
//
//   1. Sign up; admin-seed 4 closet items in READY status (the picker
//      filters out PROCESSING).
//   2. POST /closet/combinations with 3 selected itemIds + name
//      "Sunday brunch" + source 'CRAFTED'. Expect 201, response carries
//      a comboId, source=CRAFTED.
//   3. GET /closet/combinations → the new combo is in the list with
//      itemIds in the order we supplied (positions are 0..N-1).
//   4. Boundary checks:
//      a. POST with 1 itemId → 400 (min 2).
//      b. POST with 7 itemIds → 400 (max 6).
//      c. POST without `source` → 400 (required).
//   5. Cleanup admin.deleteUser.

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

interface ApiOpts {
  method: string;
  body?: unknown;
  expectStatus?: number;
}
async function api<T>(jwt: string, path: string, opts: ApiOpts): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${jwt}`,
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${API_URL}${path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: unknown;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    /* leave undefined */
  }
  if (opts.expectStatus !== undefined) {
    if (r.status !== opts.expectStatus)
      throw new Error(
        `${opts.method} ${path} → ${r.status} (expected ${opts.expectStatus}): ${text.slice(0, 200)}`,
      );
    return json as T;
  }
  if (!r.ok)
    throw new Error(`${opts.method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  return json as T;
}

async function run() {
  console.log(`\nMei craft-a-look smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let userId = '';
  let jwt = '';
  await step('admin.createUser + signIn → JWT', async () => {
    const stamp = Date.now();
    const email = `craft_${stamp}@meitest.local`;
    const password = `pw-${stamp}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Craft Smoke' },
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

  let itemIds: string[] = [];
  await step('admin seeds 4 READY closet_items', async () => {
    const { data, error } = await admin
      .from('closet_items')
      .insert([
        { user_id: userId, category: 'TOP', name: 'Sage shirt', status: 'READY' },
        { user_id: userId, category: 'BOTTOM', name: 'Indigo jeans', status: 'READY' },
        { user_id: userId, category: 'SHOE', name: 'Tan loafers', status: 'READY' },
        { user_id: userId, category: 'BAG', name: 'Cream tote', status: 'READY' },
      ])
      .select('item_id');
    if (error || !data || data.length !== 4) throw error ?? new Error('items');
    itemIds = data.map((r) => r.item_id);
  });

  let comboId = '';
  await step('POST /closet/combinations (3 items + name + CRAFTED) → 201', async () => {
    const res = await api<{ comboId: string; source: string; itemIds: string[] }>(
      jwt,
      '/closet/combinations',
      {
        method: 'POST',
        body: {
          itemIds: itemIds.slice(0, 3),
          name: 'Sunday brunch',
          source: 'CRAFTED',
        },
        expectStatus: 201,
      },
    );
    if (!res.comboId) throw new Error('no comboId');
    if (res.source !== 'CRAFTED') throw new Error(`source=${res.source}`);
    if (res.itemIds.length !== 3)
      throw new Error(`itemIds=${res.itemIds.length}`);
    comboId = res.comboId;
  });

  await step('GET /closet/combinations → new combo present', async () => {
    const res = await api<{
      items: Array<{ comboId: string; name: string; itemIds: string[]; source: string }>;
    }>(jwt, '/closet/combinations', { method: 'GET' });
    const found = res.items.find((c) => c.comboId === comboId);
    if (!found) throw new Error('combo missing from list');
    if (found.name !== 'Sunday brunch') throw new Error(`name=${found.name}`);
    if (found.itemIds.length !== 3)
      throw new Error(`itemIds=${found.itemIds.length}`);
    // The api returns itemIds ordered by the `position` column the
    // create handler set (0..N-1 in submission order).
    if (
      found.itemIds[0] !== itemIds[0] ||
      found.itemIds[1] !== itemIds[1] ||
      found.itemIds[2] !== itemIds[2]
    ) {
      throw new Error('itemIds order mismatch');
    }
  });

  await step('POST with 1 item → 400 (below MIN_ITEMS=2)', async () => {
    await api<unknown>(jwt, '/closet/combinations', {
      method: 'POST',
      body: { itemIds: [itemIds[0]!], source: 'CRAFTED' },
      expectStatus: 400,
    });
  });

  await step('POST with 7 items → 400 (above MAX_ITEMS=6)', async () => {
    // Need 7 itemIds. We only have 4 real ones; pad with random uuids.
    // The contract validates length BEFORE existence, so 400 fires on
    // the length check.
    const fake = ['a', 'b', 'c'].map(
      () => '00000000-0000-0000-0000-000000000000',
    );
    await api<unknown>(jwt, '/closet/combinations', {
      method: 'POST',
      body: { itemIds: [...itemIds, ...fake], source: 'CRAFTED' },
      expectStatus: 400,
    });
  });

  await step('POST without `source` → 400 (required)', async () => {
    await api<unknown>(jwt, '/closet/combinations', {
      method: 'POST',
      body: { itemIds: itemIds.slice(0, 2) },
      expectStatus: 400,
    });
  });

  // Cleanup
  if (userId) {
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
