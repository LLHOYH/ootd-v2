// scripts/smoke-chats-flow.ts
//
// End-to-end smoke for the /chat domain through the local api server,
// mirroring what the Chats inbox + thread detail screens drive:
//
//   1. Create A and B, sign in both, befriend.
//   2. As A: POST /chat/threads/direct {withUserId:B} → thread row + created.
//   3. As A: POST /chat/threads/:id/messages {kind:TEXT, text} → ack.
//   4. As B: GET /chat/threads → inbox includes the new thread, unread=1.
//   5. As B: subscribe to Supabase Realtime channel filtered by thread_id.
//   6. As A: send another TEXT → B's channel receives the postgres_changes
//      INSERT event before any HTTP poll.
//   7. As B: POST /chat/threads/:id/read → unreadCount = 0.
//   8. As B: GET /chat/threads/:id → both messages visible, ordered DESC.
//   9. Cleanup admin.deleteUser × 2.
//
// Pre-req: services/api/serve listening on 127.0.0.1:3001.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  const email = `chat_${suffix}_${stamp}@meitest.local`;
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
  let json: unknown = undefined;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    /* leave as text */
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  return json as T;
}

function asUser(jwt: string): SupabaseClient {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  // Realtime uses a separate WebSocket connection that doesn't read
  // `global.headers`. The JWT must be pushed onto the realtime channel
  // auth context explicitly, otherwise postgres_changes events are dropped
  // because RLS resolves to anon and the SELECT policy fails.
  client.realtime.setAuth(jwt);
  return client;
}

async function run() {
  console.log(`\nMei /chat smoke — api at ${API_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let A!: Person;
  let B!: Person;

  await step('create users A + B', async () => {
    [A, B] = await Promise.all([
      createPerson('A', 'Alice Chat'),
      createPerson('B', 'Bea Chat'),
    ]);
  });

  await step('admin seeds friendship A+B (mirrors api accept handler)', async () => {
    const lo = A.userId < B.userId ? A.userId : B.userId;
    const hi = A.userId < B.userId ? B.userId : A.userId;
    const { error } = await admin.from('friendships').insert({ user_a: lo, user_b: hi });
    if (error) throw error;
  });

  let threadId = '';
  await step('A: POST /chat/threads/direct → thread row, created=true', async () => {
    const res = await api<{ thread: { threadId: string; type: string }; created: boolean }>(
      A.jwt,
      'POST',
      '/chat/threads/direct',
      { withUserId: B.userId },
    );
    if (!res.thread.threadId) throw new Error('no threadId');
    if (res.thread.type !== 'DIRECT') throw new Error(`type=${res.thread.type}`);
    if (res.created !== true) throw new Error(`created=${res.created}, expected true`);
    threadId = res.thread.threadId;
  });

  await step('A: POST /chat/threads/direct again → idempotent (created=false)', async () => {
    const res = await api<{ thread: { threadId: string }; created: boolean }>(
      A.jwt,
      'POST',
      '/chat/threads/direct',
      { withUserId: B.userId },
    );
    if (res.thread.threadId !== threadId) throw new Error('threadId changed!');
    if (res.created !== false) throw new Error(`created=${res.created}, expected false`);
  });

  await step('A: POST first message', async () => {
    const res = await api<{ messageId: string; kind: string; text?: string }>(
      A.jwt,
      'POST',
      `/chat/threads/${threadId}/messages`,
      { kind: 'TEXT', text: 'hi from smoke' },
    );
    if (res.kind !== 'TEXT' || res.text !== 'hi from smoke')
      throw new Error('echo mismatch');
  });

  await step("B: GET /chat/threads → thread present, unread=1", async () => {
    const res = await api<{
      direct: Array<{ threadId: string; unreadCounts: Record<string, number> }>;
    }>(B.jwt, 'GET', '/chat/threads');
    const t = res.direct.find((x) => x.threadId === threadId);
    if (!t) throw new Error('thread missing in B inbox');
    if ((t.unreadCounts[B.userId] ?? 0) !== 1)
      throw new Error(`unread=${t.unreadCounts[B.userId]}`);
  });

  // ---- Realtime: subscribe as B, then have A send and confirm B receives -----
  let realtimeOk = false;
  await step('B: Realtime postgres_changes INSERT received from A', async () => {
    const sb = asUser(B.jwt);
    let received: { sender_id: string; text: string | null } | null = null;
    const channel = sb
      .channel(`chat:${threadId}:test`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          received = payload.new as { sender_id: string; text: string | null };
        },
      );
    // Wait for the SUBSCRIBE ack before triggering the insert.
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('subscribe timeout')), 8000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          res();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          rej(new Error(`subscribe failed: ${status}`));
        }
      });
    });

    // Now A sends a second message — wait up to 5s for it to land on B's
    // realtime channel.
    await api<unknown>(
      A.jwt,
      'POST',
      `/chat/threads/${threadId}/messages`,
      { kind: 'TEXT', text: 'live!' },
    );
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (received) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await sb.removeChannel(channel);
    if (!received)
      throw new Error('Realtime INSERT not received within 5s');
    if ((received as { sender_id: string }).sender_id !== A.userId)
      throw new Error('wrong sender');
    if ((received as { text: string | null }).text !== 'live!')
      throw new Error(`text mismatch: ${(received as any).text}`);
    realtimeOk = true;
  });

  await step('B: POST /chat/threads/:id/read → unreadCount=0', async () => {
    const res = await api<{ threadId: string; unreadCount: number }>(
      B.jwt,
      'POST',
      `/chat/threads/${threadId}/read`,
      {},
    );
    if (res.threadId !== threadId) throw new Error('threadId mismatch');
    if (res.unreadCount !== 0) throw new Error(`unreadCount=${res.unreadCount}`);
  });

  await step('B: GET /chat/threads/:id → both messages visible', async () => {
    const res = await api<{
      thread: { threadId: string };
      messages: { items: Array<{ messageId: string; text: string | null; sender_id?: string; senderId?: string }> };
    }>(B.jwt, 'GET', `/chat/threads/${threadId}?limit=50`);
    if (res.thread.threadId !== threadId) throw new Error('thread mismatch');
    const items = res.messages.items;
    if (items.length !== 2) throw new Error(`messages=${items.length}, expected 2`);
    // newest-first contract
    const texts = items.map((m) => m.text);
    if (texts[0] !== 'live!' || texts[1] !== 'hi from smoke') {
      throw new Error(`order wrong: ${JSON.stringify(texts)}`);
    }
  });

  // Cleanup
  for (const p of [A, B]) {
    if (p?.userId) {
      const { error } = await admin.auth.admin.deleteUser(p.userId);
      if (error) console.warn(`cleanup ${p.email}: ${error.message}`);
    }
  }

  if (!realtimeOk) {
    console.log('NOTE: realtime path failed; check Supabase Realtime on the project.');
  }
  const failed = steps.filter((s) => !s.pass).length;
  console.log(`\n${steps.length - failed}/${steps.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
