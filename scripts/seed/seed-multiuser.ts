// scripts/seed/seed-multiuser.ts
//
// Idempotent multi-user seeder. Reads ./dummy-multiuser.json, ensures every
// user listed there exists (creates if not, preserves the real account
// flagged with `preserveAuthAccount: true`), wipes their existing
// closet/combos/OOTDs/DMs/reactions, downloads any remote photos to
// ./photos-cache/, then re-inserts the whole graph: items, combinations,
// OOTD posts, friendships, friend_requests, DM threads with messages, and
// ootd_reactions.
//
// Re-runnable: every run starts from a clean slate per user. Test users
// keep the same email so their auth.users uuid is stable across runs.
//
// Usage (from repo root):
//   pnpm seed:all                              # uses ./dummy-multiuser.json
//   pnpm seed:all -- --spec other-spec.json    # custom spec
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from services/api/.env.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Args + paths
// ---------------------------------------------------------------------------

interface Args {
  specPath: string;
}
function parseArgs(argv: string[]): Args {
  let specPath = resolve(__dirname, 'dummy-multiuser.json');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec' && argv[i + 1]) {
      specPath = resolve(process.cwd(), argv[i + 1]!);
      i++;
    }
  }
  return { specPath };
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

type Category = 'DRESS' | 'TOP' | 'BOTTOM' | 'OUTERWEAR' | 'SHOE' | 'BAG' | 'ACCESSORY';
type Visibility = 'PUBLIC' | 'FRIENDS' | 'GROUP' | 'DIRECT';
type ComboSource = 'STELLA' | 'TODAY_PICK' | 'CRAFTED' | 'COORDINATED';

interface SpecItem {
  key: string;
  /** Either a local filename in ./photos/ OR an Unsplash photo id (the bare id, e.g. `1490481651871-ab68de25d43d`). */
  photo: string;
  category: Category;
  name: string;
  description: string;
  colors: string[];
  occasionTags: string[];
  weatherTags: string[];
}
interface SpecCombo {
  key: string;
  name: string;
  source: ComboSource;
  occasionTags?: string[];
  items: string[]; // refs SpecItem.key
}
interface SpecOotd {
  key: string;
  combination: string; // refs SpecCombo.key
  visibility: Visibility;
  caption?: string;
  locationName?: string;
  ageDays?: number;
}
interface SpecUser {
  key: string;
  email: string;
  password?: string;
  preserveAuthAccount?: boolean;
  profile: {
    displayName?: string;
    city?: string;
    countryCode?: string;
    climateProfile?: 'TROPICAL' | 'TEMPERATE' | 'ARID' | 'COLD';
    stylePreferences?: string[];
    discoverable?: boolean;
    contributesToCommunityLooks?: boolean;
  };
  items: SpecItem[];
  combinations: SpecCombo[];
  ootdPosts: SpecOotd[];
}
interface SpecFriendship {
  a: string; // user.key
  b: string;
}
interface SpecFriendRequest {
  from: string;
  to: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
}
interface SpecMessage {
  from: string; // user.key
  text: string;
  ageMinutes: number;
}
interface SpecThread {
  between: [string, string]; // user.key pair
  messages: SpecMessage[];
  /** which user.key still has unread_count > 0 (the most recent message's recipient by default is what we'd compute, but spec lets you set explicitly) */
  unreadFor?: string;
}
interface SpecReaction {
  ootd: string; // SpecOotd.key
  by: string; // user.key
}
interface Spec {
  $photoBaseUrl: string;
  $photoQuery: string;
  users: SpecUser[];
  friendships: SpecFriendship[];
  friendRequests: SpecFriendRequest[];
  directThreads: SpecThread[];
  ootdReactions: SpecReaction[];
}

// ---------------------------------------------------------------------------
// Photo cache
// ---------------------------------------------------------------------------

const LOCAL_PHOTOS_DIR = resolve(__dirname, 'photos');
const CACHE_DIR = resolve(__dirname, 'photos-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

/** Cycled fallback when a remote photo URL fails — keeps the seed
 *  re-runnable even if Unsplash deletes one of our IDs out from under us.
 *  Resolved lazily on first need so the seeder doesn't pay this cost when
 *  every URL works. */
let _fallbackPhotos: Buffer[] | null = null;
function getFallbackPhoto(seed: string): Buffer {
  if (_fallbackPhotos === null) {
    const fs = require('node:fs') as typeof import('node:fs');
    const candidates = fs
      .readdirSync(LOCAL_PHOTOS_DIR)
      .filter((n: string) => n.toLowerCase().endsWith('.jpg'));
    if (candidates.length === 0) {
      throw new Error('no local photos to fall back on (scripts/seed/photos/ empty)');
    }
    _fallbackPhotos = candidates.map((n: string) =>
      fs.readFileSync(join(LOCAL_PHOTOS_DIR, n)),
    );
  }
  // Stable index by hash of the seed so the same key always picks the same
  // local fallback — re-runs are deterministic.
  const idx =
    parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) %
    _fallbackPhotos.length;
  return _fallbackPhotos[idx]!;
}

/**
 * Resolve `photo` to bytes. Local file in photos/ takes precedence; otherwise
 * treat as a remote photo identifier (Unsplash photo id) and download via
 * `${spec.$photoBaseUrl}${id}${spec.$photoQuery}`. Cached on disk so re-runs
 * skip the round trip. On any download failure (404, timeout, ...) falls back
 * to a deterministically-picked local photo so the seed always completes.
 */
async function resolvePhotoBytes(
  spec: Spec,
  photo: string,
): Promise<Buffer> {
  // Local file?
  const localPath = join(LOCAL_PHOTOS_DIR, photo);
  if (existsSync(localPath)) {
    return readFileSync(localPath);
  }
  // Remote: cache by sha256 of the id so re-runs skip.
  const cacheName = `${createHash('sha256').update(photo).digest('hex').slice(0, 16)}.jpg`;
  const cachePath = join(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }
  const url = `${spec.$photoBaseUrl}${photo}${spec.$photoQuery}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(cachePath, buf);
    return buf;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`  [photo] ${photo} → fallback (${msg})`);
    return getFallbackPhoto(photo);
  }
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
    page++;
  }
}

async function ensureUser(spec: SpecUser): Promise<string> {
  const existing = await findUserIdByEmail(spec.email);
  if (existing) return existing;
  if (spec.preserveAuthAccount) {
    throw new Error(
      `[seed] user ${spec.email} not found and preserveAuthAccount=true. Sign up via the app first.`,
    );
  }
  const password = spec.password ?? `seed-${Date.now()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: spec.profile.displayName ?? spec.key },
  });
  if (error || !data?.user) throw error ?? new Error(`createUser ${spec.email}`);
  return data.user.id;
}

async function clearStoragePrefix(bucket: string, prefix: string): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data || data.length === 0) return;
  const paths = data.map((f) => `${prefix}/${f.name}`);
  await admin.storage.from(bucket).remove(paths);
}

async function wipeUserData(userId: string): Promise<void> {
  // Order matters: dependents first.
  await admin.from('chat_messages').delete().eq('sender_id', userId);
  // Per-user participants — leaves the thread row intact for the moment;
  // we fully drop direct threads where this user is a participant later.
  await admin.from('chat_thread_participants').delete().eq('user_id', userId);
  await admin.from('ootd_reactions').delete().eq('user_id', userId);
  await admin.from('ootd_posts').delete().eq('user_id', userId);
  await admin.from('combinations').delete().eq('user_id', userId);
  await admin.from('closet_items').delete().eq('user_id', userId);
  // Friendships + friend requests on either side.
  await admin.from('friendships').delete().or(`user_a.eq.${userId},user_b.eq.${userId}`);
  await admin
    .from('friend_requests')
    .delete()
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
  // Storage objects.
  await clearStoragePrefix('closet-raw', userId);
  await clearStoragePrefix('closet-tuned', userId);
}

async function patchProfile(userId: string, profile: SpecUser['profile']): Promise<void> {
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

// ---------------------------------------------------------------------------
// Insert pipeline (single user)
// ---------------------------------------------------------------------------

interface SeededUser {
  spec: SpecUser;
  userId: string;
  itemIdByKey: Map<string, string>;
  comboIdByKey: Map<string, string>;
  ootdIdByKey: Map<string, string>;
}

async function seedUser(spec: Spec, userSpec: SpecUser): Promise<SeededUser> {
  const userId = await ensureUser(userSpec);
  console.log(`\n[seed] ${userSpec.key.padEnd(8)}  ${userSpec.email}  →  ${userId}`);
  await wipeUserData(userId);
  await patchProfile(userId, userSpec.profile);

  const itemIdByKey = new Map<string, string>();
  for (const item of userSpec.items) {
    const bytes = await resolvePhotoBytes(spec, item.photo);

    // Insert row first to mint the itemId.
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
    if (insErr || !row) throw insErr ?? new Error('item insert');
    const itemId = row.item_id as string;
    itemIdByKey.set(item.key, itemId);

    const rawKey = `${userId}/${itemId}.jpg`;
    const tunedKey = `${userId}/${itemId}.jpg`;
    const thumbKey = `${userId}/${itemId}_thumb.jpg`;

    // Three uploads in parallel.
    await Promise.all([
      admin.storage.from('closet-raw').upload(rawKey, bytes, { contentType: 'image/jpeg', upsert: true }),
      admin.storage.from('closet-tuned').upload(tunedKey, bytes, { contentType: 'image/jpeg', upsert: true }),
      admin.storage.from('closet-tuned').upload(thumbKey, bytes, { contentType: 'image/jpeg', upsert: true }),
    ]);

    await admin
      .from('closet_items')
      .update({
        raw_storage_key: rawKey,
        tuned_storage_key: tunedKey,
        thumbnail_storage_key: thumbKey,
      })
      .eq('item_id', itemId);
  }
  console.log(`  items:        ${itemIdByKey.size}`);

  const comboIdByKey = new Map<string, string>();
  for (const combo of userSpec.combinations) {
    const itemIds = combo.items
      .map((k) => itemIdByKey.get(k))
      .filter((id): id is string => Boolean(id));
    if (itemIds.length < 2) continue;
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
    if (cErr || !row) throw cErr ?? new Error('combo insert');
    const comboId = row.combo_id as string;
    comboIdByKey.set(combo.key, comboId);
    await admin.from('combination_items').insert(
      itemIds.map((id, idx) => ({ combo_id: comboId, item_id: id, position: idx })),
    );
  }
  console.log(`  combinations: ${comboIdByKey.size}`);

  const ootdIdByKey = new Map<string, string>();
  for (const post of userSpec.ootdPosts) {
    const comboId = comboIdByKey.get(post.combination);
    if (!comboId) continue;
    const createdAt = post.ageDays
      ? new Date(Date.now() - post.ageDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString();
    const { data: row, error: oErr } = await admin
      .from('ootd_posts')
      .insert({
        user_id: userId,
        combo_id: comboId,
        visibility: post.visibility,
        caption: post.caption ?? null,
        location_name: post.locationName ?? null,
        created_at: createdAt,
      })
      .select('ootd_id')
      .single();
    if (oErr || !row) continue;
    ootdIdByKey.set(post.key, row.ootd_id as string);
  }
  console.log(`  ootd posts:   ${ootdIdByKey.size}`);

  return { spec: userSpec, userId, itemIdByKey, comboIdByKey, ootdIdByKey };
}

// ---------------------------------------------------------------------------
// Cross-user state
// ---------------------------------------------------------------------------

async function seedFriendships(
  userByKey: Map<string, SeededUser>,
  friendships: SpecFriendship[],
): Promise<void> {
  const rows = friendships
    .map(({ a, b }) => {
      const ua = userByKey.get(a)?.userId;
      const ub = userByKey.get(b)?.userId;
      if (!ua || !ub) return null;
      const lo = ua < ub ? ua : ub;
      const hi = ua < ub ? ub : ua;
      return { user_a: lo, user_b: hi };
    })
    .filter((r): r is { user_a: string; user_b: string } => r !== null);
  if (rows.length === 0) return;
  const { error } = await admin.from('friendships').insert(rows);
  if (error) console.warn(`[seed] friendships: ${error.message}`);
  else console.log(`\n[seed] friendships: ${rows.length}`);
}

async function seedFriendRequests(
  userByKey: Map<string, SeededUser>,
  requests: SpecFriendRequest[],
): Promise<void> {
  const rows = requests
    .map((r) => {
      const from = userByKey.get(r.from)?.userId;
      const to = userByKey.get(r.to)?.userId;
      if (!from || !to) return null;
      return { from_user_id: from, to_user_id: to, status: r.status };
    })
    .filter((r): r is { from_user_id: string; to_user_id: string; status: string } => r !== null);
  if (rows.length === 0) return;
  const { error } = await admin.from('friend_requests').insert(rows);
  if (error) console.warn(`[seed] friend_requests: ${error.message}`);
  else console.log(`[seed] friend_requests: ${rows.length}`);
}

async function seedDirectThreads(
  userByKey: Map<string, SeededUser>,
  threads: SpecThread[],
): Promise<void> {
  for (const t of threads) {
    const a = userByKey.get(t.between[0])?.userId;
    const b = userByKey.get(t.between[1])?.userId;
    if (!a || !b) continue;

    // 1. thread row
    const { data: thr, error: tErr } = await admin
      .from('chat_threads')
      .insert({ type: 'DIRECT' })
      .select('thread_id')
      .single();
    if (tErr || !thr) continue;
    const threadId = thr.thread_id as string;

    // 2. participants — set unread_count per user.
    //    Spec semantics:
    //      - `unreadFor` omitted     → both sides have read everything
    //                                   (typical "we're caught up").
    //      - `unreadFor: "<userKey>"` → only that user's last inbound
    //                                   messages count as unread.
    //    The api's mark-read endpoint zeros these, so the inbox shows the
    //    right unread badge per user.
    const unreadByUser = new Map<string, number>([
      [a, 0],
      [b, 0],
    ]);
    if (t.unreadFor) {
      const target = userByKey.get(t.unreadFor)?.userId;
      if (target) {
        for (const m of t.messages) {
          const senderUserId = userByKey.get(m.from)?.userId;
          if (!senderUserId || senderUserId === target) continue;
          unreadByUser.set(target, (unreadByUser.get(target) ?? 0) + 1);
        }
      }
    }
    await admin.from('chat_thread_participants').insert([
      { thread_id: threadId, user_id: a, unread_count: unreadByUser.get(a) ?? 0 },
      { thread_id: threadId, user_id: b, unread_count: unreadByUser.get(b) ?? 0 },
    ]);

    // 3. messages (in order) — backdate created_at via ageMinutes.
    const now = Date.now();
    const messageRows = t.messages
      .map((m) => {
        const senderUserId = userByKey.get(m.from)?.userId;
        if (!senderUserId) return null;
        return {
          thread_id: threadId,
          sender_id: senderUserId,
          kind: 'TEXT' as const,
          text: m.text,
          created_at: new Date(now - m.ageMinutes * 60_000).toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (messageRows.length > 0) {
      await admin.from('chat_messages').insert(messageRows);
    }
  }
  console.log(`[seed] direct threads: ${threads.length}`);
}

async function seedReactions(
  userByKey: Map<string, SeededUser>,
  reactions: SpecReaction[],
): Promise<void> {
  // Look up ootdId by key via any user's seeded map.
  const ootdIdByKey = new Map<string, string>();
  for (const u of userByKey.values()) {
    for (const [k, v] of u.ootdIdByKey) ootdIdByKey.set(k, v);
  }
  const rows = reactions
    .map((r) => {
      const ootdId = ootdIdByKey.get(r.ootd);
      const userId = userByKey.get(r.by)?.userId;
      if (!ootdId || !userId) return null;
      return { ootd_id: ootdId, user_id: userId, type: '♡' };
    })
    .filter((r): r is { ootd_id: string; user_id: string; type: string } => r !== null);
  if (rows.length === 0) return;
  // Upsert because the spec might list the same (ootd, user) pair if you
  // edit it; the unique constraint (ootd_id, user_id) would otherwise 409.
  const { error } = await admin.from('ootd_reactions').upsert(rows);
  if (error) console.warn(`[seed] reactions: ${error.message}`);
  else console.log(`[seed] reactions: ${rows.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const spec = JSON.parse(readFileSync(args.specPath, 'utf8')) as Spec;
  console.log(`[seed] ${spec.users.length} users from ${args.specPath}`);

  const userByKey = new Map<string, SeededUser>();
  for (const u of spec.users) {
    const seeded = await seedUser(spec, u);
    userByKey.set(u.key, seeded);
  }

  console.log('\n[seed] cross-user state');
  await seedFriendships(userByKey, spec.friendships);
  await seedFriendRequests(userByKey, spec.friendRequests);
  await seedDirectThreads(userByKey, spec.directThreads);
  await seedReactions(userByKey, spec.ootdReactions);

  console.log('\n[seed] done.');
  console.log('  users:      ', userByKey.size);
  console.log('  friendships:', spec.friendships.length);
  console.log('  fr_requests:', spec.friendRequests.length);
  console.log('  threads:    ', spec.directThreads.length);
  console.log('  reactions:  ', spec.ootdReactions.length);
  console.log('\nTest accounts (password = same as in spec):');
  for (const u of spec.users) {
    if (!u.preserveAuthAccount) {
      console.log(`  ${u.email.padEnd(28)}  ${u.password ?? '(generated)'}`);
    }
  }
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
