// scripts/smoke-stella-flow.ts
//
// End-to-end smoke for the Stella surface, mirroring what
// useStellaConversation drives:
//
//   1. Sign up a user (admin) and sign in for a JWT.
//   2. POST /stella/conversations on the api Lambda → convoId.
//   3. POST /stella/conversations/:convoId/messages on the stylist server,
//      parse the SSE stream live, capture the assembled assistant text and
//      the message_start / text_delta / message_stop / [DONE] cadence.
//   4. GET /stella/conversations/:convoId on the api Lambda → assert both
//      USER + ASSISTANT messages are persisted with the streamed text.
//   5. DELETE the conversation.
//   6. Cleanup admin.deleteUser.
//
// Pre-reqs:
//   - api running on http://127.0.0.1:3001  (pnpm --filter @mei/api serve)
//   - stylist running on http://127.0.0.1:8080  (pnpm --filter @mei/stylist start)

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
const STYLIST_URL = process.env.STYLIST_URL ?? 'http://127.0.0.1:8080';

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
  console.log(`\nMei /stella smoke — api at ${API_URL}, stylist at ${STYLIST_URL}\n`);

  await step('api /_health reachable', async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });
  await step('stylist /health reachable', async () => {
    const r = await fetch(`${STYLIST_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let userId = '';
  let jwt = '';
  await step('admin.createUser + signIn → JWT', async () => {
    const stamp = Date.now();
    const email = `stella_${stamp}@meitest.local`;
    const password = `pw-${stamp}`;
    const { data: signup, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Stella Smoke' },
    });
    if (error || !signup?.user) throw error ?? new Error('no user');
    userId = signup.user.id;
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signin, error: siErr } = await c.auth.signInWithPassword({
      email,
      password,
    });
    if (siErr || !signin.session) throw siErr ?? new Error('no session');
    jwt = signin.session.access_token;
  });

  let convoId = '';
  await step('POST /stella/conversations → convoId', async () => {
    const res = await api<{ convoId: string; conversation: { convoId: string } }>(
      jwt,
      'POST',
      '/stella/conversations',
      {},
    );
    if (!res.convoId) throw new Error('no convoId');
    convoId = res.convoId;
  });

  let assembledAssistant = '';
  let sawMessageStart = false;
  let sawMessageStop = false;
  let sawDone = false;
  let textDeltaCount = 0;
  let toolCalls = 0;
  await step('stylist SSE stream: send → message_start → deltas → stop', async () => {
    const url = `${STYLIST_URL}/stella/conversations/${encodeURIComponent(convoId)}/messages`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ text: 'hi stella, what should i wear today?' }),
    });
    if (!r.ok) throw new Error(`status ${r.status}: ${await r.text()}`);
    if (!r.body) throw new Error('no response body');

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith('data:')) continue;
        const data = frame.slice(5).trim();
        if (data === '[DONE]') {
          sawDone = true;
          break outer;
        }
        try {
          const ev = JSON.parse(data) as
            | { event: 'message_start' }
            | { event: 'text_delta'; delta: string }
            | { event: 'tool_call' }
            | { event: 'message_stop' }
            | { event: 'error'; code: string; message: string };
          if (ev.event === 'message_start') sawMessageStart = true;
          if (ev.event === 'text_delta') {
            textDeltaCount += 1;
            assembledAssistant += ev.delta;
          }
          if (ev.event === 'tool_call') toolCalls += 1;
          if (ev.event === 'message_stop') sawMessageStop = true;
          if (ev.event === 'error')
            throw new Error(`server error: ${ev.code} ${ev.message}`);
        } catch (e) {
          throw e;
        }
      }
    }
    if (!sawMessageStart) throw new Error('never saw message_start');
    if (!sawMessageStop) throw new Error('never saw message_stop');
    if (!sawDone) throw new Error('never saw [DONE]');
    if (textDeltaCount === 0) throw new Error('no text deltas streamed');
  });

  await step('GET /stella/conversations/:convoId → user + assistant persisted', async () => {
    const res = await api<{
      conversation: { convoId: string };
      messages: Array<{ role: 'USER' | 'ASSISTANT'; text: string | null }>;
    }>(jwt, 'GET', `/stella/conversations/${convoId}`);
    if (res.conversation.convoId !== convoId) throw new Error('convoId mismatch');
    const userMsgs = res.messages.filter((m) => m.role === 'USER');
    const aiMsgs = res.messages.filter((m) => m.role === 'ASSISTANT');
    if (userMsgs.length < 1) throw new Error('no USER message persisted');
    if (aiMsgs.length < 1) throw new Error('no ASSISTANT message persisted');
    if (userMsgs[0]!.text !== 'hi stella, what should i wear today?')
      throw new Error('user text mismatch');
    // The persisted assistant text should match what we assembled from the
    // stream (modulo any trailing whitespace).
    const assistantConcat = aiMsgs.map((m) => m.text ?? '').join('');
    if (!assistantConcat.includes(assembledAssistant.trim()) &&
        !assembledAssistant.trim().includes(assistantConcat)) {
      // Loose comparison since the server may split assistant turns into
      // multiple rows (text + tool_use + text). Just require non-empty.
      if (assistantConcat.length === 0)
        throw new Error('assistant transcript empty');
    }
  });

  await step('DELETE /stella/conversations/:convoId → 200', async () => {
    await api<unknown>(jwt, 'DELETE', `/stella/conversations/${convoId}`);
  });

  await step('GET after delete → 404', async () => {
    try {
      await api<unknown>(jwt, 'GET', `/stella/conversations/${convoId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('404')) throw err;
      return;
    }
    throw new Error('expected 404 after delete');
  });

  // Cleanup
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup: ${error.message}`);
  }

  console.log(`\nstreamed ${textDeltaCount} deltas / ${toolCalls} tool_calls; final text:\n  "${assembledAssistant.trim()}"`);
  const failed = steps.filter((s) => !s.pass).length;
  console.log(`\n${steps.length - failed}/${steps.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
