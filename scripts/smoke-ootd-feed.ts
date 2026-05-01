// scripts/smoke-ootd-feed.ts
//
// End-to-end smoke for the OOTD feed (SPEC §10.8) + react/unreact:
//
//   1. Sign up A, B, C; befriend A↔B; leave C as a stranger.
//   2. A creates a closet item + combination + selfie + OOTD post (PUBLIC).
//   3. B's feed includes A's PUBLIC post (RLS visibility + friendship).
//   4. C's feed does NOT include A's post (RLS gates non-friend).
//   5. B reacts → reactionCount=1 + my-reaction=true.
//   6. B unreacts → reactionCount=0 + my-reaction=false.
//   7. A creates a FRIENDS-only post; B sees it; C does not.
//   8. A creates a DIRECT post visible only to C (visibilityTargets=[C]);
//      B does NOT see it; C does (RLS treats DIRECT as visible to listed
//      targets even without friendship).
//   9. Cleanup admin.deleteUser × 3.

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
  const email = `ootdfeed_${suffix}_${stamp}@meitest.local`;
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
  console.log(`\nMei /ootd/feed smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let A!: Person;
  let B!: Person;
  let C!: Person;

  await step('create users A, B, C', async () => {
    [A, B, C] = await Promise.all([
      createPerson('A', 'Alice OOTD'),
      createPerson('B', 'Bea OOTD'),
      createPerson('C', 'Cee OOTD'),
    ]);
  });

  await step('admin seeds friendship A↔B (C stays a stranger)', async () => {
    const lo = A.userId < B.userId ? A.userId : B.userId;
    const hi = A.userId < B.userId ? B.userId : A.userId;
    const { error } = await admin.from('friendships').insert({ user_a: lo, user_b: hi });
    if (error) throw error;
  });

  let publicComboId = '';
  let publicOotdId = '';

  await step('A seeds 2 closet items + combo + PUBLIC OOTD', async () => {
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
      .insert({ user_id: A.userId, name: 'Smoke look', source: 'CRAFTED' })
      .select('combo_id')
      .single();
    if (cErr) throw cErr;
    publicComboId = combo.combo_id;
    const { error: jErr } = await admin.from('combination_items').insert([
      { combo_id: publicComboId, item_id: items[0]!.item_id, position: 0 },
      { combo_id: publicComboId, item_id: items[1]!.item_id, position: 1 },
    ]);
    if (jErr) throw jErr;

    const { data: ootd, error: oErr } = await admin
      .from('ootd_posts')
      .insert({
        user_id: A.userId,
        combo_id: publicComboId,
        visibility: 'PUBLIC',
        caption: 'Smoke OOTD public',
      })
      .select('ootd_id')
      .single();
    if (oErr) throw oErr;
    publicOotdId = ootd.ootd_id;
  });

  await step('B (friend) sees A\'s PUBLIC OOTD in /ootd/feed', async () => {
    const res = await api<{ items: Array<{ ootdId: string; userId: string }> }>(
      B.jwt,
      'GET',
      '/ootd/feed',
    );
    if (!res.items.some((p) => p.ootdId === publicOotdId))
      throw new Error('PUBLIC post missing from B feed');
  });

  await step("C (stranger) does NOT see A's PUBLIC OOTD (visibility ≠ PUBLIC-to-anon)", async () => {
    // PUBLIC visibility per the policy still requires the caller to be a
    // friend of the author OR the author themselves — see
    // ootd_posts_visibility. C is neither, so the post is hidden.
    const res = await api<{ items: Array<{ ootdId: string }> }>(
      C.jwt,
      'GET',
      '/ootd/feed',
    );
    if (res.items.some((p) => p.ootdId === publicOotdId))
      throw new Error('PUBLIC post leaked to non-friend C');
  });

  await step('B reacts to the OOTD → count=1 + meReacted=true', async () => {
    const r1 = await api<{ ootdId: string; reactionCount: number }>(
      B.jwt,
      'POST',
      `/ootd/${publicOotdId}/react`,
      { type: '♡' },
    );
    if (r1.reactionCount !== 1) throw new Error(`count=${r1.reactionCount}`);
    // Confirm via a feed re-fetch
    const feed = await api<{ items: Array<{ ootdId: string; reactions: Array<{ userId: string }> }> }>(
      B.jwt,
      'GET',
      '/ootd/feed',
    );
    const post = feed.items.find((p) => p.ootdId === publicOotdId);
    if (!post) throw new Error('post missing on refetch');
    if (!post.reactions.some((r) => r.userId === B.userId))
      throw new Error('B not in reactions list');
  });

  await step('B unreacts → count=0', async () => {
    const r = await api<{ ootdId: string; reactionCount: number }>(
      B.jwt,
      'DELETE',
      `/ootd/${publicOotdId}/react`,
    );
    if (r.reactionCount !== 0) throw new Error(`count=${r.reactionCount}`);
  });

  await step('A creates FRIENDS post; B sees it, C does not', async () => {
    const { data: ootd, error: oErr } = await admin
      .from('ootd_posts')
      .insert({
        user_id: A.userId,
        combo_id: publicComboId,
        visibility: 'FRIENDS',
        caption: 'friends only',
      })
      .select('ootd_id')
      .single();
    if (oErr) throw oErr;
    const fid = ootd.ootd_id;

    const bFeed = await api<{ items: Array<{ ootdId: string }> }>(B.jwt, 'GET', '/ootd/feed');
    if (!bFeed.items.some((p) => p.ootdId === fid))
      throw new Error('B (friend) missed FRIENDS post');
    const cFeed = await api<{ items: Array<{ ootdId: string }> }>(C.jwt, 'GET', '/ootd/feed');
    if (cFeed.items.some((p) => p.ootdId === fid))
      throw new Error('FRIENDS post leaked to non-friend C');
  });

  await step('A creates DIRECT post targeting C; B does NOT see it, C does', async () => {
    const { data: ootd, error: oErr } = await admin
      .from('ootd_posts')
      .insert({
        user_id: A.userId,
        combo_id: publicComboId,
        visibility: 'DIRECT',
        visibility_targets: [C.userId],
        caption: 'just for C',
      })
      .select('ootd_id')
      .single();
    if (oErr) throw oErr;
    const did = ootd.ootd_id;

    const cFeed = await api<{ items: Array<{ ootdId: string }> }>(C.jwt, 'GET', '/ootd/feed');
    if (!cFeed.items.some((p) => p.ootdId === did))
      throw new Error('C (target) missed DIRECT post');
    const bFeed = await api<{ items: Array<{ ootdId: string }> }>(B.jwt, 'GET', '/ootd/feed');
    if (bFeed.items.some((p) => p.ootdId === did))
      throw new Error('DIRECT post leaked to non-target B');
  });

  // Cleanup
  for (const p of [A, B, C]) {
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
