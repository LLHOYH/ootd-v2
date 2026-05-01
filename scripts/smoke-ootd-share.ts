// scripts/smoke-ootd-share.ts
//
// End-to-end smoke for the Wear this · Confirm & share flow (SPEC §10.10).
// Mirrors what the mobile app/share.tsx route does:
//
//   1. Sign up A + B; befriend them.
//   2. A seeds 2 closet items + a combination (this PR doesn't wire combo
//      creation — feat/wire-craft-look ships that; here we admin-seed).
//   3. A POST /ootd (visibility=FRIENDS) for the combo.
//   4. B GET /ootd/feed → A's new post is visible (RLS visibility check).
//   5. A POST /ootd with visibility=GROUP but no visibilityTargets →
//      returns 400 (super-refine validation in CreateOotdBody).
//   6. A POST /ootd with visibility=PUBLIC + caption + locationName →
//      both surface on the feed payload.
//   7. Cleanup admin.deleteUser × 2.
//
// Pre-req: api running on http://127.0.0.1:3001.

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
  const email = `share_${suffix}_${stamp}@meitest.local`;
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
  console.log(`\nMei /ootd share smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let A!: Person;
  let B!: Person;
  await step('create users A + B', async () => {
    [A, B] = await Promise.all([
      createPerson('A', 'Alice Share'),
      createPerson('B', 'Bea Share'),
    ]);
  });

  await step('admin seeds friendship A↔B', async () => {
    const lo = A.userId < B.userId ? A.userId : B.userId;
    const hi = A.userId < B.userId ? B.userId : A.userId;
    const { error } = await admin.from('friendships').insert({ user_a: lo, user_b: hi });
    if (error) throw error;
  });

  let comboId = '';
  await step('A seeds 2 closet items + combination', async () => {
    const { data: items, error: iErr } = await admin
      .from('closet_items')
      .insert([
        { user_id: A.userId, category: 'TOP', name: 'Smoke top', status: 'READY' },
        { user_id: A.userId, category: 'BOTTOM', name: 'Smoke bottom', status: 'READY' },
      ])
      .select('item_id');
    if (iErr || !items) throw iErr ?? new Error('items');
    const { data: combo, error: cErr } = await admin
      .from('combinations')
      .insert({ user_id: A.userId, name: 'Smoke share look', source: 'CRAFTED' })
      .select('combo_id')
      .single();
    if (cErr) throw cErr;
    comboId = combo.combo_id;
    const { error: jErr } = await admin.from('combination_items').insert([
      { combo_id: comboId, item_id: items[0]!.item_id, position: 0 },
      { combo_id: comboId, item_id: items[1]!.item_id, position: 1 },
    ]);
    if (jErr) throw jErr;
  });

  let friendsOotdId = '';
  await step('A POST /ootd visibility=FRIENDS → 201', async () => {
    const res = await api<{ ootdId: string; status: string }>(A.jwt, '/ootd', {
      method: 'POST',
      body: { comboId, visibility: 'FRIENDS' },
      expectStatus: 201,
    });
    if (!res.ootdId) throw new Error('no ootdId');
    friendsOotdId = res.ootdId;
  });

  await step('B (friend) sees the FRIENDS post in /ootd/feed', async () => {
    const res = await api<{ items: Array<{ ootdId: string }> }>(
      B.jwt,
      '/ootd/feed',
      { method: 'GET' },
    );
    if (!res.items.some((p) => p.ootdId === friendsOotdId))
      throw new Error('B did not see A\'s FRIENDS post');
  });

  await step('A POST /ootd visibility=GROUP without targets → 400', async () => {
    const r = await fetch(`${API_URL}/ootd`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${A.jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ comboId, visibility: 'GROUP' }),
    });
    if (r.status !== 400)
      throw new Error(`expected 400, got ${r.status}`);
  });

  await step('A POST /ootd PUBLIC + caption + locationName → roundtrip', async () => {
    const created = await api<{ ootdId: string }>(A.jwt, '/ootd', {
      method: 'POST',
      body: {
        comboId,
        visibility: 'PUBLIC',
        caption: 'cream linen + tan loafers ♡',
        locationName: 'Tiong Bahru',
      },
      expectStatus: 201,
    });
    // Friends-feed shows it because B is friends with A and PUBLIC is a
    // strict superset of FRIENDS.
    const feed = await api<{
      items: Array<{
        ootdId: string;
        caption?: string;
        locationName?: string;
        visibility: string;
      }>;
    }>(B.jwt, '/ootd/feed', { method: 'GET' });
    const post = feed.items.find((p) => p.ootdId === created.ootdId);
    if (!post) throw new Error('PUBLIC post missing from feed');
    if (post.caption !== 'cream linen + tan loafers ♡')
      throw new Error(`caption=${post.caption}`);
    if (post.locationName !== 'Tiong Bahru')
      throw new Error(`locationName=${post.locationName}`);
    if (post.visibility !== 'PUBLIC')
      throw new Error(`visibility=${post.visibility}`);
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
