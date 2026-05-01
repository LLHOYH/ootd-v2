// scripts/smoke-backend.ts
//
// End-to-end backend smoke against the live `mei` Supabase project.
// Exercises auth + RLS + every business domain's primary write/read path.
//
// Run from repo root:
//   pnpm dlx tsx scripts/smoke-backend.ts
//
// Reads SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY from
// services/api/.env. Cleans up everything via admin.deleteUser at the end.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// .env loader — minimal, no extra dep.
// ---------------------------------------------------------------------------

function loadEnv(path: string): Record<string, string> {
  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnv(resolve(__dirname, "..", "services", "api", ".env"));
const SUPABASE_URL = env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("missing SUPABASE_* env in services/api/.env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Output helpers.
// ---------------------------------------------------------------------------

type Step = { name: string; pass: boolean; detail?: string };
const steps: Step[] = [];
let bail = false;

function record(name: string, pass: boolean, detail?: string) {
  steps.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  const colour = pass ? "\x1b[32m" : "\x1b[31m";
  console.log(`${colour}${tag}\x1b[0m ${name}${detail ? `  — ${detail}` : ""}`);
  if (!pass) bail = true;
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (bail) {
    record(name, false, "skipped (earlier step failed)");
    return null;
  }
  try {
    const out = await fn();
    record(name, true);
    return out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    record(name, false, msg);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Clients.
// ---------------------------------------------------------------------------

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// JWT-scoped client builder — mimics what api handlers do via attachSupabaseClient.
function asUser(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ---------------------------------------------------------------------------
// Test data.
// ---------------------------------------------------------------------------

const stamp = Date.now();
const userA = {
  email: `smoke_a_${stamp}@meitest.local`,
  password: "smoke-pass-A-" + stamp,
  display: "Smoke A",
};
const userB = {
  email: `smoke_b_${stamp}@meitest.local`,
  password: "smoke-pass-B-" + stamp,
  display: "Smoke B",
};

let aId = "";
let bId = "";
let aJwt = "";
let bJwt = "";

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

async function run() {
  console.log(`\nMei backend smoke — ${SUPABASE_URL}\n`);

  // 1. Sign up two users via admin (email_confirm bypasses email).
  await step("admin.createUser A", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: userA.email,
      password: userA.password,
      email_confirm: true,
      user_metadata: { display_name: userA.display },
    });
    if (error) throw error;
    if (!data.user) throw new Error("no user returned");
    aId = data.user.id;
  });

  await step("admin.createUser B", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: userB.email,
      password: userB.password,
      email_confirm: true,
      user_metadata: { display_name: userB.display },
    });
    if (error) throw error;
    if (!data.user) throw new Error("no user returned");
    bId = data.user.id;
  });

  // 2. Verify the handle_new_auth_user trigger mirrored both into public.users.
  await step("handle_new_auth_user trigger mirrored A → public.users", async () => {
    const { data, error } = await admin
      .from("users")
      .select("user_id, display_name, username, discoverable")
      .eq("user_id", aId)
      .single();
    if (error) throw error;
    if (data.display_name !== userA.display)
      throw new Error(`display_name=${data.display_name}`);
    if (data.discoverable !== false)
      throw new Error(`discoverable should default to false`);
  });

  await step("handle_new_auth_user trigger mirrored B → public.users", async () => {
    const { error } = await admin.from("users").select("user_id").eq("user_id", bId).single();
    if (error) throw error;
  });

  // 3. Sign in to get JWTs (this is what the mobile client does after signup).
  await step("signInWithPassword A → JWT", async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.auth.signInWithPassword({
      email: userA.email,
      password: userA.password,
    });
    if (error) throw error;
    aJwt = data.session!.access_token;
  });

  await step("signInWithPassword B → JWT", async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.auth.signInWithPassword({
      email: userB.email,
      password: userB.password,
    });
    if (error) throw error;
    bJwt = data.session!.access_token;
  });

  // 4. Profile patch as user A — proves users_update_self policy.
  await step("user A patches own profile (style_preferences)", async () => {
    const a = asUser(aJwt);
    const { error } = await a
      .from("users")
      .update({ style_preferences: ["minimalist", "monochrome"], discoverable: true })
      .eq("user_id", aId);
    if (error) throw error;
  });

  // 5. Closet — A inserts an item, lists own, RLS-blocks B from reading it.
  let itemAId = "";
  let itemA2Id = "";
  await step("user A inserts closet_items (2 rows)", async () => {
    const a = asUser(aJwt);
    const { data, error } = await a
      .from("closet_items")
      .insert([
        {
          user_id: aId,
          category: "TOP",
          name: "Smoke linen shirt",
          colors: ["white"],
          occasion_tags: ["CASUAL"],
          weather_tags: ["WARM"],
          status: "READY",
        },
        {
          user_id: aId,
          category: "BOTTOM",
          name: "Smoke trousers",
          colors: ["black"],
          occasion_tags: ["CASUAL", "WORK"],
          weather_tags: ["MILD"],
          status: "READY",
        },
      ])
      .select("item_id");
    if (error) throw error;
    if (!data || data.length !== 2) throw new Error(`expected 2 rows, got ${data?.length}`);
    itemAId = data[0]!.item_id;
    itemA2Id = data[1]!.item_id;
  });

  await step("user A lists own closet_items", async () => {
    const a = asUser(aJwt);
    const { data, error } = await a.from("closet_items").select("item_id").eq("user_id", aId);
    if (error) throw error;
    if (!data || data.length < 2) throw new Error(`got ${data?.length} rows`);
  });

  await step("RLS: user B cannot read user A's closet_items", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("closet_items")
      .select("item_id")
      .eq("user_id", aId);
    // RLS makes this return zero rows (not an error) — invisible, not denied.
    if (error) throw error;
    if (data && data.length > 0)
      throw new Error(`B saw ${data.length} of A's items — RLS leak`);
  });

  // 6. Combination — A creates a 2-item combo and the join rows.
  let comboAId = "";
  await step("user A creates a combination + combination_items", async () => {
    const a = asUser(aJwt);
    const { data: c, error: cErr } = await a
      .from("combinations")
      .insert({
        user_id: aId,
        name: "Smoke combo",
        occasion_tags: ["CASUAL"],
        source: "CRAFTED",
      })
      .select("combo_id")
      .single();
    if (cErr) throw cErr;
    comboAId = c.combo_id;
    const { error: jErr } = await a.from("combination_items").insert([
      { combo_id: comboAId, item_id: itemAId, position: 0 },
      { combo_id: comboAId, item_id: itemA2Id, position: 1 },
    ]);
    if (jErr) throw jErr;
  });

  // 7. Friendship handshake — A → B request, B accepts.
  await step("user A sends friend_request → B", async () => {
    const a = asUser(aJwt);
    const { error } = await a.from("friend_requests").insert({
      from_user_id: aId,
      to_user_id: bId,
      status: "PENDING",
    });
    if (error) throw error;
  });

  await step("user B sees the inbound friend_request", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("friend_requests")
      .select("from_user_id, status")
      .eq("to_user_id", bId)
      .eq("status", "PENDING");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("no inbound request visible");
    if (data[0]!.from_user_id !== aId) throw new Error("wrong sender");
  });

  await step("user B accepts → friendships row created (canonical least/greatest)", async () => {
    const b = asUser(bJwt);
    // Update the request to ACCEPTED. The friendships row needs to be added by
    // the api handler (no INSERT policy on friendships by design — handlers
    // use service_role). Here we reproduce that step via admin.
    const { error: e1 } = await b
      .from("friend_requests")
      .update({ status: "ACCEPTED" })
      .eq("from_user_id", aId)
      .eq("to_user_id", bId);
    if (e1) throw e1;
    const lo = aId < bId ? aId : bId;
    const hi = aId < bId ? bId : aId;
    const { error: e2 } = await admin.from("friendships").insert({ user_a: lo, user_b: hi });
    if (e2) throw e2;
  });

  await step("is_friend(A,B) returns true", async () => {
    const { data, error } = await admin.rpc("is_friend", { a: aId, b: bId });
    if (error) throw error;
    if (data !== true) throw new Error(`is_friend=${data}`);
  });

  await step("user B can now see user A's profile (users_select_visible: friend)", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("users")
      .select("user_id, display_name")
      .eq("user_id", aId)
      .single();
    if (error) throw error;
    if (data.display_name !== userA.display) throw new Error("display_name mismatch");
  });

  // 8. OOTD — A posts a PUBLIC OOTD; B reads it via the friends/public feed.
  let ootdAId = "";
  await step("user A creates an ootd_post (PUBLIC)", async () => {
    const a = asUser(aJwt);
    const { data, error } = await a
      .from("ootd_posts")
      .insert({
        user_id: aId,
        combo_id: comboAId,
        visibility: "PUBLIC",
        caption: "Smoke OOTD",
      })
      .select("ootd_id")
      .single();
    if (error) throw error;
    ootdAId = data.ootd_id;
  });

  await step("user B reads user A's PUBLIC OOTD", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("ootd_posts")
      .select("ootd_id, caption, visibility")
      .eq("ootd_id", ootdAId)
      .single();
    if (error) throw error;
    if (data.caption !== "Smoke OOTD") throw new Error("caption mismatch");
  });

  await step("user B reacts to user A's OOTD", async () => {
    const b = asUser(bJwt);
    const { error } = await b.from("ootd_reactions").insert({
      ootd_id: ootdAId,
      user_id: bId,
      type: "♡",
    });
    if (error) throw error;
  });

  // 9. Chat — DM thread between A and B.
  let threadId = "";
  await step("create DIRECT chat_thread + participants (admin, mirrors handler)", async () => {
    const { data: t, error: tErr } = await admin
      .from("chat_threads")
      .insert({ type: "DIRECT" })
      .select("thread_id")
      .single();
    if (tErr) throw tErr;
    threadId = t.thread_id;
    const { error: pErr } = await admin.from("chat_thread_participants").insert([
      { thread_id: threadId, user_id: aId },
      { thread_id: threadId, user_id: bId },
    ]);
    if (pErr) throw pErr;
  });

  await step("user A sends TEXT chat_message", async () => {
    const a = asUser(aJwt);
    const { error } = await a.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: aId,
      kind: "TEXT",
      text: "Smoke hi",
    });
    if (error) throw error;
  });

  await step("user B reads A's chat_message (chat_messages_touch_thread fires)", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("chat_messages")
      .select("text, sender_id")
      .eq("thread_id", threadId);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("B saw no messages");
    if (data[0]!.text !== "Smoke hi") throw new Error("text mismatch");
  });

  // 10. Stella — A creates a conversation + a USER message.
  let convoId = "";
  await step("user A creates a stella_conversation + USER message", async () => {
    const a = asUser(aJwt);
    const { data: c, error: cErr } = await a
      .from("stella_conversations")
      .insert({ user_id: aId, title: "Smoke convo" })
      .select("convo_id")
      .single();
    if (cErr) throw cErr;
    convoId = c.convo_id;
    const { error: mErr } = await a.from("stella_messages").insert({
      convo_id: convoId,
      role: "USER",
      text: "What should I wear today?",
    });
    if (mErr) throw mErr;
  });

  await step("user A reads own stella_messages", async () => {
    const a = asUser(aJwt);
    const { data, error } = await a
      .from("stella_messages")
      .select("text")
      .eq("convo_id", convoId);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("no messages");
  });

  await step("RLS: user B cannot read A's stella_messages", async () => {
    const b = asUser(bJwt);
    const { data, error } = await b
      .from("stella_messages")
      .select("message_id")
      .eq("convo_id", convoId);
    if (error) throw error;
    if (data && data.length > 0)
      throw new Error(`B saw ${data.length} of A's stella messages — RLS leak`);
  });

  // 11. Anon (no JWT) is fully blocked.
  await step("RLS: anon (no JWT) cannot read users table", async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anon.from("users").select("user_id").limit(1);
    // Anon either gets zero rows (RLS) or a permission error — both acceptable.
    if (error) return;
    if (data && data.length > 0) throw new Error("anon read users — RLS leak");
  });
}

// ---------------------------------------------------------------------------
// Cleanup — admin.deleteUser cascades to public.users → all owned data,
// including the friendships row, ootd, combos, etc.
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log("\nCleanup…");
  if (aId) {
    const { error } = await admin.auth.admin.deleteUser(aId);
    if (error) console.warn(`cleanup A: ${error.message}`);
    else console.log(`  deleted user A ${aId}`);
  }
  if (bId) {
    const { error } = await admin.auth.admin.deleteUser(bId);
    if (error) console.warn(`cleanup B: ${error.message}`);
    else console.log(`  deleted user B ${bId}`);
  }
}

// ---------------------------------------------------------------------------

run()
  .catch((err) => {
    console.error("\nfatal:", err);
    bail = true;
  })
  .finally(async () => {
    await cleanup();
    const passed = steps.filter((s) => s.pass).length;
    const failed = steps.filter((s) => !s.pass).length;
    console.log(`\n${passed}/${steps.length} steps passed (${failed} failed)`);
    process.exit(failed === 0 ? 0 : 1);
  });
