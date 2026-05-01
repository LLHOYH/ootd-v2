// scripts/seed/seed.ts
//
// Idempotent seeder for a single user's closet + combinations + OOTDs.
// Reads ./dummy-closet.json, looks up the target user by email via the
// Supabase admin auth API, wipes their existing closet/combos/OOTDs +
// related storage objects, then inserts everything fresh.
//
// Re-runnable: every run starts from a clean slate for that user. Other
// users' data is untouched. Friendships are preserved (so you don't lose
// your test friend graph each time).
//
// Usage (from repo root):
//   pnpm seed                              # uses targetEmail in JSON
//   pnpm seed -- --email other@user.io     # override
//   pnpm seed -- --spec scripts/seed/other-spec.json
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// services/api/.env. The service-role key bypasses RLS — needed because
// we're operating on behalf of the user across multiple tables and
// uploading to private buckets.

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI args + paths
// ---------------------------------------------------------------------------

interface Args {
  email?: string;
  specPath: string;
}

function parseArgs(argv: string[]): Args {
  let email: string | undefined;
  let specPath = resolve(__dirname, 'dummy-closet.json');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email' && next) {
      email = next;
      i++;
    } else if (a === '--spec' && next) {
      specPath = resolve(process.cwd(), next);
      i++;
    }
  }
  return email ? { email, specPath } : { specPath };
}

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------

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

const env = loadEnv(resolve(__dirname, '..', '..', 'services', 'api', '.env'));
const SUPABASE_URL = env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[seed] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in services/api/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Spec types
// ---------------------------------------------------------------------------

interface Spec {
  targetEmail: string;
  profile: {
    displayName?: string;
    city?: string;
    countryCode?: string;
    climateProfile?: 'TROPICAL' | 'TEMPERATE' | 'ARID' | 'COLD';
    stylePreferences?: string[];
    discoverable?: boolean;
    contributesToCommunityLooks?: boolean;
  };
  items: Array<{
    key: string;
    photo: string;
    category: 'DRESS' | 'TOP' | 'BOTTOM' | 'OUTERWEAR' | 'SHOE' | 'BAG' | 'ACCESSORY';
    name: string;
    description: string;
    colors: string[];
    occasionTags: string[];
    weatherTags: string[];
  }>;
  combinations: Array<{
    name: string;
    source: 'STELLA' | 'TODAY_PICK' | 'CRAFTED' | 'COORDINATED';
    occasionTags?: string[];
    items: string[]; // refers to item.key
  }>;
  ootdPosts: Array<{
    combinationName: string;
    visibility: 'PUBLIC' | 'FRIENDS' | 'GROUP' | 'DIRECT';
    caption?: string;
    locationName?: string;
    ageDays?: number; // backdate the post by N days for natural feed ordering
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findUserIdByEmail(email: string): Promise<string | null> {
  // The admin API doesn't expose getUserByEmail directly; list + filter.
  // Page through users until we find a match. For a small project this is
  // a single page in practice.
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
    page++;
  }
}

async function clearStoragePrefix(bucket: string, prefix: string): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    // Empty prefix lists return no error; this only fires for permission /
    // network problems.
    console.warn(`[seed] list ${bucket}/${prefix} → ${error.message}`);
    return;
  }
  if (!data || data.length === 0) return;
  const paths = data.map((f) => `${prefix}/${f.name}`);
  const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
  if (rmErr) console.warn(`[seed] remove ${bucket}/${prefix}: ${rmErr.message}`);
}

async function wipeUserData(userId: string): Promise<void> {
  // Order matters: delete dependents before parents.
  console.log('[seed] wiping existing data for user', userId);
  // OOTD posts (cascades reactions).
  await admin.from('ootd_posts').delete().eq('user_id', userId);
  // Combinations (cascade combination_items via FK).
  await admin.from('combinations').delete().eq('user_id', userId);
  // Closet items (cascade combination_items as well, but combos are gone now).
  await admin.from('closet_items').delete().eq('user_id', userId);
  // Storage objects under {userId}/* in both closet buckets.
  await clearStoragePrefix('closet-raw', userId);
  await clearStoragePrefix('closet-tuned', userId);
}

async function patchProfile(
  userId: string,
  profile: Spec['profile'],
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (profile.displayName != null) update.display_name = profile.displayName;
  if (profile.city != null) update.city = profile.city;
  if (profile.countryCode != null) update.country_code = profile.countryCode;
  if (profile.climateProfile != null) update.climate_profile = profile.climateProfile;
  if (profile.stylePreferences != null) update.style_preferences = profile.stylePreferences;
  if (profile.discoverable != null) update.discoverable = profile.discoverable;
  if (profile.contributesToCommunityLooks != null) {
    update.contributes_to_community_looks = profile.contributesToCommunityLooks;
  }
  if (Object.keys(update).length === 0) return;
  const { error } = await admin.from('users').update(update).eq('user_id', userId);
  if (error) throw error;
}

async function uploadPhoto(
  bucket: string,
  storageKey: string,
  bytes: Buffer,
): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(storageKey, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`upload ${bucket}/${storageKey}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const spec = JSON.parse(readFileSync(args.specPath, 'utf8')) as Spec;
  const email = args.email ?? spec.targetEmail;
  if (!email) {
    console.error('[seed] no target email — pass --email or set targetEmail in the spec');
    process.exit(1);
  }
  console.log('[seed] target email:', email);

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    console.error(`[seed] no auth user with email ${email}. Sign up via the app first, then re-run.`);
    process.exit(1);
  }
  console.log('[seed] resolved userId:', userId);

  // Wipe old data so the script is re-runnable.
  await wipeUserData(userId);

  // Profile patch.
  await patchProfile(userId, spec.profile);
  console.log('[seed] profile patched');

  // Closet items + photo upload + AI tags.
  // Map item.key → newly minted itemId so combinations can reference them.
  const itemIdByKey = new Map<string, string>();
  const photosDir = resolve(__dirname, 'photos');
  for (const item of spec.items) {
    const photoPath = join(photosDir, item.photo);
    let bytes: Buffer;
    try {
      bytes = readFileSync(photoPath);
    } catch (err) {
      console.error(`[seed] could not read ${photoPath}: ${(err as Error).message}`);
      continue;
    }

    // Insert the row first so the DB picks the itemId.
    const { data: row, error: insErr } = await admin
      .from('closet_items')
      .insert({
        user_id: userId,
        category: item.category,
        name: item.name,
        description: item.description,
        colors: item.colors,
        occasion_tags: item.occasionTags,
        weather_tags: item.weatherTags,
        status: 'READY',
      })
      .select('item_id')
      .single();
    if (insErr || !row) {
      console.error(`[seed] insert ${item.key}: ${insErr?.message ?? 'no row'}`);
      continue;
    }
    const itemId = row.item_id as string;
    itemIdByKey.set(item.key, itemId);

    // Upload the photo to both buckets so the closet thumb + the OOTD
    // fallback OutfitCard composite can resolve URLs.
    //   closet-raw    is private; only the worker reads via service-role.
    //   closet-tuned  is public (CDN-cached); mobile reads via public URL.
    // We use jpeg in the tuned bucket because the bucket allows it (see
    // 0003_storage_buckets.sql) — saves us a sharp re-encode in the seed.
    const rawKey = `${userId}/${itemId}.jpg`;
    const tunedKey = `${userId}/${itemId}.jpg`;
    const thumbKey = `${userId}/${itemId}_thumb.jpg`;
    await uploadPhoto('closet-raw', rawKey, bytes);
    await uploadPhoto('closet-tuned', tunedKey, bytes);
    await uploadPhoto('closet-tuned', thumbKey, bytes);

    // Patch the row with the storage keys.
    const { error: patchErr } = await admin
      .from('closet_items')
      .update({
        raw_storage_key: rawKey,
        tuned_storage_key: tunedKey,
        thumbnail_storage_key: thumbKey,
      })
      .eq('item_id', itemId);
    if (patchErr) {
      console.error(`[seed] patch ${item.key}: ${patchErr.message}`);
      continue;
    }
    console.log(`  [item] ${item.key.padEnd(22)}  ${item.name}`);
  }

  // Combinations + combination_items.
  const comboIdByName = new Map<string, string>();
  for (const combo of spec.combinations) {
    const itemIds = combo.items
      .map((k) => itemIdByKey.get(k))
      .filter((id): id is string => Boolean(id));
    if (itemIds.length < 2) {
      console.warn(`[seed] skipping combo "${combo.name}" — needs ≥ 2 valid items`);
      continue;
    }
    const { data: row, error: cErr } = await admin
      .from('combinations')
      .insert({
        user_id: userId,
        name: combo.name,
        source: combo.source,
        occasion_tags: combo.occasionTags ?? [],
      })
      .select('combo_id')
      .single();
    if (cErr || !row) {
      console.error(`[seed] insert combo ${combo.name}: ${cErr?.message ?? 'no row'}`);
      continue;
    }
    const comboId = row.combo_id as string;
    comboIdByName.set(combo.name, comboId);

    const joinRows = itemIds.map((id, idx) => ({
      combo_id: comboId,
      item_id: id,
      position: idx,
    }));
    const { error: jErr } = await admin.from('combination_items').insert(joinRows);
    if (jErr) {
      console.error(`[seed] combination_items for ${combo.name}: ${jErr.message}`);
      continue;
    }
    console.log(`  [combo] ${combo.name.padEnd(22)}  ${itemIds.length} items`);
  }

  // OOTD posts.
  for (const post of spec.ootdPosts) {
    const comboId = comboIdByName.get(post.combinationName);
    if (!comboId) {
      console.warn(`[seed] skipping OOTD — combo "${post.combinationName}" not found`);
      continue;
    }
    const createdAt = post.ageDays
      ? new Date(Date.now() - post.ageDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString();
    const { error: oErr } = await admin.from('ootd_posts').insert({
      user_id: userId,
      combo_id: comboId,
      visibility: post.visibility,
      caption: post.caption ?? null,
      location_name: post.locationName ?? null,
      created_at: createdAt,
    });
    if (oErr) {
      console.error(`[seed] insert ootd ${post.combinationName}: ${oErr.message}`);
      continue;
    }
    console.log(`  [ootd]  ${post.combinationName.padEnd(22)}  ${post.visibility}`);
  }

  console.log('\n[seed] done.');
  console.log(`  user:         ${userId}`);
  console.log(`  items:        ${itemIdByKey.size}`);
  console.log(`  combinations: ${comboIdByName.size}`);
  console.log(`  ootd posts:   ${spec.ootdPosts.length}`);
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
