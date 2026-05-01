// scripts/smoke-you-profile.ts
//
// End-to-end smoke for the You screen's data path. The screen reads via the
// supabase client directly (no api lambda involvement), so this script
// mirrors that same flow against the live `mei` Supabase project.
//
//   1. Create a user (admin) → email_confirm + user_metadata.display_name.
//   2. Sign in → JWT.
//   3. Mint a JWT-scoped supabase client (mirrors what the mobile app uses).
//   4. Confirm the auth-trigger seeded public.users (display_name, username,
//      discoverable=false default).
//   5. Patch the row to add gender / birth_year / city / climate / style tags
//      (RLS allows users_update_self).
//   6. Seed three closet items + one combination + one selfie + one OOTD post,
//      via the JWT-scoped client where RLS allows it (admin for the OOTD
//      because hangouts/visibility checks need cross-table reads).
//   7. Friend handshake with a second user (admin to sidestep the API for
//      this test).
//   8. Run the same five parallel reads the hook does, with the JWT client:
//      profile + selfies count + items count + ootds count + friendships
//      count. Verify each matches the seeds.
//   9. Cleanup admin.deleteUser × 2.

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

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function asUser(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

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

async function run() {
  console.log(`\nMei /you smoke — ${SUPABASE_URL}\n`);

  const stamp = Date.now();
  const meEmail = `you_smoke_${stamp}@meitest.local`;
  const mePassword = `pw-${stamp}`;
  const friendEmail = `you_friend_${stamp}@meitest.local`;
  const friendPassword = `fpw-${stamp}`;
  let meId = '';
  let friendId = '';
  let meJwt = '';

  await step('admin.createUser me + friend', async () => {
    const a = await admin.auth.admin.createUser({
      email: meEmail,
      password: mePassword,
      email_confirm: true,
      user_metadata: { display_name: 'You Smoke' },
    });
    if (a.error || !a.data.user) throw a.error ?? new Error('me missing');
    meId = a.data.user.id;
    const b = await admin.auth.admin.createUser({
      email: friendEmail,
      password: friendPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Friend Smoke' },
    });
    if (b.error || !b.data.user) throw b.error ?? new Error('friend missing');
    friendId = b.data.user.id;
  });

  await step('signInWithPassword → JWT', async () => {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await c.auth.signInWithPassword({
      email: meEmail,
      password: mePassword,
    });
    if (error || !data.session) throw error ?? new Error('no session');
    meJwt = data.session.access_token;
  });

  await step('handle_new_auth_user trigger seeded public.users', async () => {
    const me = asUser(meJwt);
    const { data, error } = await me
      .from('users')
      .select('display_name, username, discoverable')
      .eq('user_id', meId)
      .single();
    if (error) throw error;
    if (data.display_name !== 'You Smoke')
      throw new Error(`display_name=${data.display_name}`);
    if (data.discoverable !== false)
      throw new Error(`discoverable=${data.discoverable}, expected false default`);
  });

  await step('user updates own profile (RLS users_update_self)', async () => {
    const me = asUser(meJwt);
    const { error } = await me
      .from('users')
      .update({
        gender: 'F',
        birth_year: 1998,
        city: 'Tokyo',
        country_code: 'JP',
        climate_profile: 'TEMPERATE',
        style_preferences: ['minimal', 'monochrome', 'linen'],
      })
      .eq('user_id', meId);
    if (error) throw error;
  });

  // Seed: 3 closet items + 1 combination + 1 selfie + 1 OOTD.
  await step('seed 3 closet_items + 1 combination + 1 selfie', async () => {
    const me = asUser(meJwt);
    const { data: items, error: iErr } = await me
      .from('closet_items')
      .insert([
        { user_id: meId, category: 'TOP', name: 'Smoke top', status: 'READY' },
        { user_id: meId, category: 'BOTTOM', name: 'Smoke bottom', status: 'READY' },
        { user_id: meId, category: 'SHOE', name: 'Smoke shoe', status: 'READY' },
      ])
      .select('item_id');
    if (iErr || !items || items.length !== 3) throw iErr ?? new Error('seed items');
    const { data: combo, error: cErr } = await me
      .from('combinations')
      .insert({ user_id: meId, name: 'Smoke look', source: 'CRAFTED' })
      .select('combo_id')
      .single();
    if (cErr) throw cErr;
    const { error: jErr } = await me.from('combination_items').insert([
      { combo_id: combo.combo_id, item_id: items[0]!.item_id, position: 0 },
      { combo_id: combo.combo_id, item_id: items[1]!.item_id, position: 1 },
      { combo_id: combo.combo_id, item_id: items[2]!.item_id, position: 2 },
    ]);
    if (jErr) throw jErr;
    const { error: sErr } = await me
      .from('selfies')
      .insert({ user_id: meId, storage_key: `${meId}/smoke.jpg` });
    if (sErr) throw sErr;
    // OOTD post (PUBLIC) — pulls combo from above.
    const { error: oErr } = await me
      .from('ootd_posts')
      .insert({
        user_id: meId,
        combo_id: combo.combo_id,
        visibility: 'PUBLIC',
        caption: 'Smoke OOTD',
      });
    if (oErr) throw oErr;
  });

  // Friendship handshake — admin inserts the canonical friendships row.
  await step('admin seeds a friendship row (mirrors api accept handler)', async () => {
    const lo = meId < friendId ? meId : friendId;
    const hi = meId < friendId ? friendId : meId;
    const { error } = await admin.from('friendships').insert({ user_a: lo, user_b: hi });
    if (error) throw error;
  });

  // Now the actual hook flow: 5 parallel reads via the JWT-scoped client.
  await step('useMyProfile-shaped read returns the right counts', async () => {
    const me = asUser(meJwt);
    const [profileRes, selfiesRes, itemsRes, ootdsRes, friendsRes] = await Promise.all([
      me
        .from('users')
        .select(
          'user_id, username, display_name, avatar_url, gender, birth_year, city, country_code, climate_profile, style_preferences, discoverable, contributes_to_community_looks',
        )
        .eq('user_id', meId)
        .maybeSingle(),
      me
        .from('selfies')
        .select('selfie_id', { count: 'exact', head: true })
        .eq('user_id', meId),
      me
        .from('closet_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('user_id', meId),
      me
        .from('ootd_posts')
        .select('ootd_id', { count: 'exact', head: true })
        .eq('user_id', meId),
      me
        .from('friendships')
        .select('user_a', { count: 'exact', head: true })
        .or(`user_a.eq.${meId},user_b.eq.${meId}`),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data) throw new Error('profile row missing');
    const profile = profileRes.data;

    if (profile.gender !== 'F') throw new Error(`gender=${profile.gender}`);
    if (profile.birth_year !== 1998) throw new Error(`birth_year=${profile.birth_year}`);
    if (profile.city !== 'Tokyo') throw new Error(`city=${profile.city}`);
    if (profile.climate_profile !== 'TEMPERATE')
      throw new Error(`climate=${profile.climate_profile}`);
    if (
      !Array.isArray(profile.style_preferences) ||
      profile.style_preferences.length !== 3
    )
      throw new Error('style_preferences not seeded');

    if (selfiesRes.count !== 1) throw new Error(`selfies count=${selfiesRes.count}`);
    if (itemsRes.count !== 3) throw new Error(`items count=${itemsRes.count}`);
    if (ootdsRes.count !== 1) throw new Error(`ootds count=${ootdsRes.count}`);
    if (friendsRes.count !== 1) throw new Error(`friends count=${friendsRes.count}`);
  });

  // Cleanup
  for (const id of [meId, friendId]) {
    if (id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup ${id}: ${error.message}`);
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
