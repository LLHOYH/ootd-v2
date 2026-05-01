// scripts/smoke-friends-flow.ts
//
// End-to-end smoke for the /friends domain through the local api server,
// mirroring what the Add Friends screen drives:
//
//   1. Create A and B (and a third, C, for unfriend coverage).
//   2. Sign A in → JWT.
//   3. GET /friends/search?q=<B's username> via JWT → finds B (after B sets
//      discoverable=true).
//   4. POST /friends/requests {toUserId: B}.
//   5. As B, GET /friends/requests → inbound contains A.
//   6. As B, POST /friends/requests/:A/accept → response carries A's summary.
//   7. As A, GET /friends → contains B.
//   8. As A, DELETE /friends/:B → 200, empty.
//   9. As A, GET /friends → empty.
//  10. Cleanup all users via admin.deleteUser.
//
// Pre-req: services/api/serve listening on 127.0.0.1:3001 (or set API_URL).

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
  displayName: string;
  username: string;
  userId: string;
  jwt: string;
}

async function createPerson(suffix: string, displayName: string): Promise<Person> {
  const stamp = Date.now();
  const email = `friends_${suffix}_${stamp}@meitest.local`;
  const password = `pw-${stamp}`;
  const { data: signup, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !signup?.user) throw error ?? new Error('no user');
  const userId = signup.user.id;

  // Pull whatever username the trigger derived.
  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('username')
    .eq('user_id', userId)
    .single();
  if (rowErr) throw rowErr;
  const username = row.username as string;

  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signin, error: siErr } = await c.auth.signInWithPassword({
    email,
    password,
  });
  if (siErr || !signin.session) throw siErr ?? new Error('no session');

  return {
    email,
    password,
    displayName,
    username,
    userId,
    jwt: signin.session.access_token,
  };
}

async function api<T>(jwt: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (jwt) headers.authorization = `Bearer ${jwt}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: unknown = undefined;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    /* leave as text */
  }
  if (!r.ok) {
    throw new Error(
      `${method} ${path} → ${r.status}: ${text.slice(0, 200)}`,
    );
  }
  return json as T;
}

async function run() {
  console.log(`\nMei /friends smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let A!: Person;
  let B!: Person;
  let C!: Person;

  await step('create users A, B, C', async () => {
    [A, B, C] = await Promise.all([
      createPerson('A', 'Alice Smoke'),
      createPerson('B', 'Bea Smoke'),
      createPerson('C', 'Cee Smoke'),
    ]);
  });

  // B + C must be discoverable to surface in search.
  await step('mark B + C discoverable=true', async () => {
    const { error: eb } = await admin
      .from('users')
      .update({ discoverable: true })
      .eq('user_id', B.userId);
    if (eb) throw eb;
    const { error: ec } = await admin
      .from('users')
      .update({ discoverable: true })
      .eq('user_id', C.userId);
    if (ec) throw ec;
  });

  // Search using B's username (a substring suffices).
  let foundB = false;
  await step('A searches and finds B', async () => {
    const q = B.username.slice(0, Math.min(6, B.username.length));
    const res = await api<{ items: Array<{ userId: string }> }>(
      A.jwt,
      'GET',
      `/friends/search?q=${encodeURIComponent(q)}`,
    );
    foundB = res.items.some((u) => u.userId === B.userId);
    if (!foundB) throw new Error(`B not found in search results for q=${q}`);
  });

  await step('A sends friend request to B', async () => {
    const res = await api<{ fromUserId: string; toUserId: string; status: string }>(
      A.jwt,
      'POST',
      '/friends/requests',
      { toUserId: B.userId },
    );
    if (res.toUserId !== B.userId) throw new Error('toUserId mismatch');
    if (res.status !== 'PENDING') throw new Error(`status=${res.status}`);
  });

  await step('B sees inbound request from A', async () => {
    const res = await api<{
      inbound: Array<{ fromUserId: string }>;
      outbound: Array<{ toUserId: string }>;
    }>(B.jwt, 'GET', '/friends/requests');
    if (!res.inbound.some((r) => r.fromUserId === A.userId))
      throw new Error('A not in B inbound');
  });

  await step('A sees outbound request to B', async () => {
    const res = await api<{
      inbound: Array<{ fromUserId: string }>;
      outbound: Array<{ toUserId: string }>;
    }>(A.jwt, 'GET', '/friends/requests');
    if (!res.outbound.some((r) => r.toUserId === B.userId))
      throw new Error('B not in A outbound');
  });

  await step('B accepts the request', async () => {
    const res = await api<{ friend: { userId: string } }>(
      B.jwt,
      'POST',
      `/friends/requests/${encodeURIComponent(A.userId)}/accept`,
    );
    if (res.friend.userId !== A.userId) throw new Error('friend.userId mismatch');
  });

  await step('A sees B in /friends', async () => {
    const res = await api<{ items: Array<{ userId: string }> }>(
      A.jwt,
      'GET',
      '/friends',
    );
    if (!res.items.some((f) => f.userId === B.userId))
      throw new Error('B missing from A friends list');
  });

  await step('A unfriends B', async () => {
    await api<{}>(A.jwt, 'DELETE', `/friends/${encodeURIComponent(B.userId)}`);
  });

  await step('A friends list is empty after unfriend', async () => {
    const res = await api<{ items: Array<{ userId: string }> }>(
      A.jwt,
      'GET',
      '/friends',
    );
    if (res.items.some((f) => f.userId === B.userId))
      throw new Error('B still in A friends');
  });

  // Coverage for outbound cancel: A → C, then A cancels.
  await step('A cancels an outbound request to C', async () => {
    await api<unknown>(A.jwt, 'POST', '/friends/requests', { toUserId: C.userId });
    await api<unknown>(
      A.jwt,
      'DELETE',
      `/friends/requests/${encodeURIComponent(C.userId)}`,
    );
    const res = await api<{ outbound: Array<{ toUserId: string }> }>(
      A.jwt,
      'GET',
      '/friends/requests',
    );
    if (res.outbound.some((r) => r.toUserId === C.userId))
      throw new Error('C still in outbound after cancel');
  });

  // Coverage for decline.
  await step('A → C → C declines', async () => {
    await api<unknown>(A.jwt, 'POST', '/friends/requests', { toUserId: C.userId });
    await api<unknown>(
      C.jwt,
      'POST',
      `/friends/requests/${encodeURIComponent(A.userId)}/decline`,
    );
    const res = await api<{ inbound: Array<{ fromUserId: string }> }>(
      C.jwt,
      'GET',
      '/friends/requests',
    );
    if (res.inbound.some((r) => r.fromUserId === A.userId))
      throw new Error('A still in C inbound after decline');
  });

  // Cleanup.
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
