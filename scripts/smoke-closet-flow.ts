// scripts/smoke-closet-flow.ts
//
// End-to-end smoke for the closet read paths (SPEC §10.2):
//
//   1. Sign up a user, sign in for a JWT.
//   2. Insert 5 closet items (mix of categories + statuses) + 2
//      combinations via supabase admin.
//   3. GET /closet/items (no filter) → all 5 items in newest-first order.
//   4. GET /closet/items?category=TOP → only TOPs.
//   5. GET /closet/combinations → both combos.
//   6. RLS leak check: a second signed-in user's GET /closet/items returns
//      none of A's items (RLS scopes to caller).
//   7. Cleanup admin.deleteUser × 2.

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

interface Person {
  email: string;
  password: string;
  userId: string;
  jwt: string;
}

async function createPerson(suffix: string, displayName: string): Promise<Person> {
  const stamp = Date.now();
  const email = `closet_${suffix}_${stamp}@meitest.local`;
  const password = `pw-${stamp}`;
  const { data: signup, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !signup?.user) throw error ?? new Error('no user');
  const userId = signup.user.id;
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signin, error: siErr } = await c.auth.signInWithPassword({
    email,
    password,
  });
  if (siErr || !signin.session) throw siErr ?? new Error('no session');
  return { email, password, userId, jwt: signin.session.access_token };
}

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
  console.log(`\nMei /closet smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let A!: Person;
  let B!: Person;

  await step('create users A + B', async () => {
    [A, B] = await Promise.all([
      createPerson('A', 'Alice Closet'),
      createPerson('B', 'Bea Closet'),
    ]);
  });

  let aItemIds: string[] = [];
  let comboIds: string[] = [];

  await step('seed 5 closet_items (mixed categories) for A', async () => {
    const { data, error } = await admin
      .from('closet_items')
      .insert([
        { user_id: A.userId, category: 'TOP', name: 'Cream tee', status: 'READY' },
        { user_id: A.userId, category: 'TOP', name: 'Sage shirt', status: 'READY' },
        { user_id: A.userId, category: 'BOTTOM', name: 'Indigo jeans', status: 'READY' },
        { user_id: A.userId, category: 'SHOE', name: 'Tan loafers', status: 'READY' },
        { user_id: A.userId, category: 'BAG', name: 'Cream tote', status: 'PROCESSING' },
      ])
      .select('item_id');
    if (error || !data || data.length !== 5) throw error ?? new Error('seed items');
    aItemIds = data.map((r) => r.item_id);
  });

  await step('seed 2 combinations for A (with combination_items)', async () => {
    const { data: combos, error: cErr } = await admin
      .from('combinations')
      .insert([
        { user_id: A.userId, name: 'Casual', source: 'CRAFTED' },
        { user_id: A.userId, name: 'Workday', source: 'STELLA' },
      ])
      .select('combo_id');
    if (cErr || !combos || combos.length !== 2) throw cErr ?? new Error('seed combos');
    comboIds = combos.map((c) => c.combo_id);
    const { error: jErr } = await admin.from('combination_items').insert([
      { combo_id: comboIds[0]!, item_id: aItemIds[0]!, position: 0 },
      { combo_id: comboIds[0]!, item_id: aItemIds[2]!, position: 1 },
      { combo_id: comboIds[1]!, item_id: aItemIds[1]!, position: 0 },
      { combo_id: comboIds[1]!, item_id: aItemIds[3]!, position: 1 },
    ]);
    if (jErr) throw jErr;
  });

  await step('GET /closet/items (A) → 5 items', async () => {
    const res = await api<{ items: Array<{ itemId: string; category: string; name: string }> }>(
      A.jwt,
      'GET',
      '/closet/items',
    );
    if (res.items.length !== 5) throw new Error(`got ${res.items.length} items, expected 5`);
  });

  await step('GET /closet/items?category=TOP (A) → 2 tops', async () => {
    const res = await api<{ items: Array<{ category: string }> }>(
      A.jwt,
      'GET',
      '/closet/items?category=TOP',
    );
    if (res.items.length !== 2) throw new Error(`got ${res.items.length} TOPs, expected 2`);
    for (const it of res.items) {
      if (it.category !== 'TOP') throw new Error(`bad category in filter result: ${it.category}`);
    }
  });

  await step('GET /closet/items?status=PROCESSING (A) → 1 row', async () => {
    const res = await api<{ items: Array<{ status: string }> }>(
      A.jwt,
      'GET',
      '/closet/items?status=PROCESSING',
    );
    if (res.items.length !== 1) throw new Error(`got ${res.items.length}, expected 1`);
  });

  await step('GET /closet/combinations (A) → 2 combos', async () => {
    const res = await api<{ items: Array<{ comboId: string; itemIds: string[] }> }>(
      A.jwt,
      'GET',
      '/closet/combinations',
    );
    if (res.items.length !== 2) throw new Error(`got ${res.items.length}, expected 2`);
    // Each combo had 2 items in the seed.
    for (const c of res.items) {
      if (c.itemIds.length !== 2)
        throw new Error(`combo ${c.comboId} has ${c.itemIds.length} items, expected 2`);
    }
  });

  await step('RLS: B sees zero of A\'s items', async () => {
    const res = await api<{ items: unknown[] }>(B.jwt, 'GET', '/closet/items');
    if (res.items.length !== 0)
      throw new Error(`B saw ${res.items.length} items — RLS leak`);
  });

  await step('RLS: B sees zero of A\'s combinations', async () => {
    const res = await api<{ items: unknown[] }>(B.jwt, 'GET', '/closet/combinations');
    if (res.items.length !== 0)
      throw new Error(`B saw ${res.items.length} combos — RLS leak`);
  });

  // Cleanup
  for (const p of [A, B]) {
    if (p?.userId) {
      const { error } = await admin.auth.admin.deleteUser(p.userId);
      if (error) console.warn(`cleanup ${p.email}: ${error.message}`);
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
