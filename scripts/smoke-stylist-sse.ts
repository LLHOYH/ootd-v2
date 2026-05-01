// scripts/smoke-stylist-sse.ts
//
// End-to-end smoke for the Stella HTTP service. Assumes the server is
// already listening on localhost:8080 (boot it with
// `pnpm --filter @mei/stylist start` from another shell, or this script
// will boot it for you if STYLIST_AUTOSTART=1).
//
//  1. Create a fresh user via admin (auto-confirmed).
//  2. Sign in to get the user's JWT.
//  3. Insert a stella_conversations row for that user (admin client).
//  4. POST /stella/conversations/:convoId/messages with Bearer <JWT>.
//  5. Parse the SSE stream and print each event.
//  6. Cleanup: admin.deleteUser cascades the conversation + messages.
//
// Defaults to MockProvider (services/stylist/.env has no ANTHROPIC_API_KEY),
// so this is free and offline-deterministic.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path: string): Record<string, string> {
  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const apiEnv = loadEnv(resolve(__dirname, "..", "services", "api", ".env"));
const SUPABASE_URL = apiEnv.SUPABASE_URL!;
const SUPABASE_ANON_KEY = apiEnv.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = apiEnv.SUPABASE_SERVICE_ROLE_KEY!;
const STYLIST_URL = process.env.STYLIST_URL ?? "http://127.0.0.1:8080";
const AUTOSTART = process.env.STYLIST_AUTOSTART === "1";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let serverProc: ChildProcess | null = null;

async function bootIfNeeded() {
  // Cheap probe for /health.
  try {
    const r = await fetch(`${STYLIST_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      console.log(`stylist already up at ${STYLIST_URL}`);
      return;
    }
  } catch {
    // not running — fall through
  }

  if (!AUTOSTART) {
    throw new Error(
      `stylist not reachable at ${STYLIST_URL}. ` +
        `Either boot it (pnpm --filter @mei/stylist start) or rerun with STYLIST_AUTOSTART=1.`,
    );
  }

  console.log("starting stylist locally…");
  serverProc = spawn("pnpm", ["--filter", "@mei/stylist", "start"], {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, ...loadEnv(resolve(__dirname, "..", "services", "stylist", ".env")) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  serverProc.stdout?.on("data", (b) => process.stdout.write(`[stylist] ${b}`));
  serverProc.stderr?.on("data", (b) => process.stderr.write(`[stylist] ${b}`));

  // Poll /health up to 20s.
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    try {
      const r = await fetch(`${STYLIST_URL}/health`);
      if (r.ok) {
        console.log("stylist is up");
        return;
      }
    } catch {
      /* keep waiting */
    }
  }
  throw new Error("stylist never came up");
}

async function run() {
  await bootIfNeeded();

  // 1. Create test user.
  const stamp = Date.now();
  const email = `smoke_stella_${stamp}@meitest.local`;
  const password = `pw-${stamp}`;
  const display = "Smoke Stella";

  const { data: signup, error: suErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: display },
  });
  if (suErr || !signup?.user) throw suErr ?? new Error("no user");
  const userId = signup.user.id;
  console.log(`created user ${userId}`);

  let convoId = "";

  try {
    // 2. Sign in.
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sign, error: siErr } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });
    if (siErr || !sign.session) throw siErr ?? new Error("no session");
    const jwt = sign.session.access_token;
    console.log("signed in, got JWT");

    // 3. Create a stella_conversations row.
    const { data: convo, error: cErr } = await admin
      .from("stella_conversations")
      .insert({ user_id: userId, title: "Smoke convo" })
      .select("convo_id")
      .single();
    if (cErr) throw cErr;
    convoId = convo.convo_id;
    console.log(`created stella conversation ${convoId}`);

    // 4. Hit the SSE endpoint.
    const url = `${STYLIST_URL}/stella/conversations/${convoId}/messages`;
    console.log(`POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "hi stella, what should i wear today?" }),
    });
    console.log(`status: ${res.status}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`stylist responded ${res.status}: ${body}`);
    }
    if (!res.body) throw new Error("no response body");

    // 5. Parse SSE stream.
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buf = "";
    let eventCount = 0;
    let sawDone = false;
    let sawTextDelta = false;
    let sawMessageStart = false;

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE frames are delimited by \n\n.
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith("data:")) continue;
        const data = frame.slice(5).trim();
        if (data === "[DONE]") {
          sawDone = true;
          break outer;
        }
        try {
          const ev = JSON.parse(data);
          eventCount += 1;
          if (ev.event === "message_start") sawMessageStart = true;
          if (ev.event === "content_block_delta" && ev.delta?.type === "text_delta")
            sawTextDelta = true;
          // Print a compact summary of each event.
          const summary =
            ev.delta?.text != null ? `text="${String(ev.delta.text).slice(0, 40)}…"` : "";
          console.log(`  event[${eventCount}] ${ev.event}${summary ? ` ${summary}` : ""}`);
        } catch (e) {
          console.warn("  non-JSON SSE frame:", data.slice(0, 80));
        }
      }
    }

    console.log("\n--- SSE smoke results ---");
    console.log(`events received   : ${eventCount}`);
    console.log(`saw message_start : ${sawMessageStart}`);
    console.log(`saw text_delta    : ${sawTextDelta}`);
    console.log(`saw [DONE]        : ${sawDone}`);

    if (eventCount === 0 || !sawDone) {
      throw new Error("SSE stream did not produce expected events");
    }

    // 6. Verify persisted messages.
    const { data: msgs, error: mErr } = await admin
      .from("stella_messages")
      .select("role, text")
      .eq("convo_id", convoId)
      .order("created_at");
    if (mErr) throw mErr;
    console.log(`persisted messages: ${msgs?.length ?? 0}`);
    for (const m of msgs ?? []) {
      console.log(`  - ${m.role}: ${(m.text ?? "").slice(0, 60)}`);
    }

    console.log("\nPASS");
  } finally {
    // Cleanup user → cascades to convo + messages.
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.warn(`cleanup deleteUser: ${error.message}`);
      else console.log(`cleaned up user ${userId}`);
    }
  }
}

run()
  .catch((err) => {
    console.error("\nFAIL:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (serverProc) {
      console.log("stopping local stylist…");
      serverProc.kill("SIGTERM");
    }
  });
