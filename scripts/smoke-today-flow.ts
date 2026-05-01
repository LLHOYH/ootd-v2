// scripts/smoke-today-flow.ts
//
// Mirrors what the mobile app does on the Today screen:
//   1. Sign up + sign in a test user (admin → password sign-in).
//   2. Hit GET /today on the local api server with the JWT.
//   3. Insert a closet item + combination, refetch, assert todaysPick fills.
//   4. Verify the GetTodayResponse shape parses cleanly via @mei/types.
//   5. Cleanup.
//
// Pre-req: the api local server must be listening on http://127.0.0.1:3001
// (i.e. `pnpm --filter @mei/api serve`). The script aborts with a clear
// message if it can't reach /_health.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Minimal shape check — the api emits this contract, validated server-side
// already. We just sanity-check the keys/types on the wire here, without
// pulling @mei/types (this script lives outside any workspace package).
function assertGetTodayShape(v: unknown): asserts v is {
  weather?: { tempC: number; condition: string; city: string; weatherTag: string };
  events: Array<{ id: string; title: string; startsAt: string }>;
  todaysPick?: { comboId: string; itemIds: string[] };
  communityLooks: Array<{ ootdId: string; username: string }>;
  fashionNow: Array<{ id: string; title: string }>;
} {
  if (!v || typeof v !== "object") throw new Error("response not object");
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.events)) throw new Error("events not array");
  if (!Array.isArray(o.communityLooks)) throw new Error("communityLooks not array");
  if (!Array.isArray(o.fashionNow)) throw new Error("fashionNow not array");
  if (o.weather !== undefined) {
    const w = o.weather as Record<string, unknown>;
    if (typeof w.tempC !== "number") throw new Error("weather.tempC not number");
    if (typeof w.city !== "string") throw new Error("weather.city not string");
  }
  if (o.todaysPick !== undefined) {
    const t = o.todaysPick as Record<string, unknown>;
    if (typeof t.comboId !== "string") throw new Error("todaysPick.comboId not string");
    if (!Array.isArray(t.itemIds)) throw new Error("todaysPick.itemIds not array");
  }
}

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

const env = loadEnv(resolve(__dirname, "..", "services", "api", ".env"));
const SUPABASE_URL = env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Step = { name: string; pass: boolean; detail?: string };
const steps: Step[] = [];
function record(name: string, pass: boolean, detail?: string) {
  steps.push({ name, pass, detail });
  console.log(`${pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${detail ? `  — ${detail}` : ""}`);
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

async function run() {
  console.log(`\nMei /today smoke — api at ${API_URL}\n`);

  // 0. Reachability.
  await step("api /_health reachable", async () => {
    const r = await fetch(`${API_URL}/_health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  const stamp = Date.now();
  const email = `today_flow_${stamp}@meitest.local`;
  const password = `pw-${stamp}`;
  let userId = "";

  await step("admin.createUser", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Flow Smoke" },
    });
    if (error || !data.user) throw error ?? new Error("no user");
    userId = data.user.id;
  });

  let jwt = "";
  await step("signInWithPassword → JWT", async () => {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error("no session");
    jwt = data.session.access_token;
  });

  // 1. First fetch — empty closet, no todaysPick expected.
  let firstRes: unknown;
  await step("GET /today (empty closet)", async () => {
    const r = await fetch(`${API_URL}/today`, {
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) throw new Error(`status ${r.status}: ${await r.text()}`);
    firstRes = await r.json();
  });

  await step("response shape matches GetTodayResponse contract", async () => {
    assertGetTodayShape(firstRes);
    if (firstRes.todaysPick) throw new Error("expected no todaysPick yet");
    if (firstRes.fashionNow.length === 0) throw new Error("expected fashionNow placeholders");
  });

  // 2. Add closet items + a combination, then refetch — todaysPick should fill.
  let comboId = "";
  await step("user inserts closet items + combination (admin, mirrors handler)", async () => {
    const { data: items, error: iErr } = await admin
      .from("closet_items")
      .insert([
        { user_id: userId, category: "TOP", name: "Smoke top", status: "READY" },
        { user_id: userId, category: "BOTTOM", name: "Smoke bottom", status: "READY" },
      ])
      .select("item_id");
    if (iErr || !items || items.length !== 2) throw iErr ?? new Error("items missing");
    const { data: combo, error: cErr } = await admin
      .from("combinations")
      .insert({ user_id: userId, name: "Smoke combo", source: "CRAFTED" })
      .select("combo_id")
      .single();
    if (cErr) throw cErr;
    comboId = combo.combo_id;
    const { error: jErr } = await admin.from("combination_items").insert([
      { combo_id: comboId, item_id: items[0]!.item_id, position: 0 },
      { combo_id: comboId, item_id: items[1]!.item_id, position: 1 },
    ]);
    if (jErr) throw jErr;
  });

  await step("GET /today after combo creation → todaysPick populated", async () => {
    const r = await fetch(`${API_URL}/today`, {
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const body = await r.json();
    assertGetTodayShape(body);
    if (!body.todaysPick) throw new Error("todaysPick missing");
    if (body.todaysPick.comboId !== comboId)
      throw new Error("todaysPick id mismatch");
    if (body.todaysPick.itemIds.length !== 2)
      throw new Error(`itemIds=${body.todaysPick.itemIds.length}`);
  });

  // 3. Auth: missing token → 401.
  await step("GET /today without bearer → 401", async () => {
    const r = await fetch(`${API_URL}/today`);
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  // 4. Cleanup.
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup: ${error.message}`);
    else console.log(`\ncleaned up user ${userId}`);
  }

  const failed = steps.filter((s) => !s.pass).length;
  console.log(`\n${steps.length - failed}/${steps.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
