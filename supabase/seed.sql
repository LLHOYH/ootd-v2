-- Mei — local-dev seed
--
-- Mirrors `services/mock-server/src/fixtures/seed.ts` so screens that hit the
-- real Supabase stack render the same Sophia-in-Singapore world.
--
-- UUID scheme (stable, hex-only, hand-assigned so they're easy to grep):
--   users           : 00000001-0000-0000-0000-0000000000XX
--   closet_items    : 00000002-0000-0000-0000-0000000000XX
--   combinations    : 00000003-0000-0000-0000-0000000000XX
--   selfies         : 00000004-0000-0000-0000-0000000000XX
--   ootd_posts      : 00000005-0000-0000-0000-0000000000XX
--   hangouts        : 00000006-0000-0000-0000-0000000000XX
--   chat_threads    : 00000007-0000-0000-0000-0000000000XX
--   chat_messages   : 00000008-0000-0000-0000-0000000000XX
--   stella_convos   : 00000009-0000-0000-0000-0000000000XX
--   stella_messages : 0000000a-0000-0000-0000-0000000000XX
--
-- Sophia's user_id is `00000001-0000-0000-0000-000000000001`. See README.md
-- for how to log in as her against the local stack.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so a developer can
-- re-run after `supabase db reset` without first wiping rows.

------------------------------------------------------------------------------
-- 0. Auth users
--
-- Supabase's local stack accepts a hand-crafted `auth.users` row. Password
-- for every seeded user is "password123" — bcrypt of that string below.
-- Hosted environments should create users via the dashboard or SDK; this
-- seed is local-dev only.
------------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
select
  u.id::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', u.email,
  -- bcrypt('password123', 10) — same hash for every dev user
  '$2a$10$abcdefghijklmnopqrstuuI/i7Y/oH3lRBkRQX0kQ1YqJWNkW0y0H6',
  now(), now() - interval '180 days', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, false, false
from (values
  ('00000001-0000-0000-0000-000000000001', 'sophia@example.com'),
  ('00000001-0000-0000-0000-000000000002', 'meili@example.com'),
  ('00000001-0000-0000-0000-000000000003', 'serena@example.com'),
  ('00000001-0000-0000-0000-000000000004', 'jia@example.com'),
  ('00000001-0000-0000-0000-000000000005', 'amelia@example.com'),
  ('00000001-0000-0000-0000-000000000006', 'anna@example.com'),
  ('00000001-0000-0000-0000-000000000007', 'lou@example.com'),
  ('00000001-0000-0000-0000-000000000008', 'kimi@example.com'),
  ('00000001-0000-0000-0000-000000000009', 'navi@example.com')
) as u(id, email)
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- 1. public.users
------------------------------------------------------------------------------

insert into public.users (
  user_id, username, display_name, avatar_url, gender, birth_year,
  country_code, city, style_preferences, climate_profile,
  discoverable, contributes_to_community_looks,
  created_at, last_active_at
) values
  ('00000001-0000-0000-0000-000000000001'::uuid, 'sophia',   'Sophia Chen',  'https://placehold.co/200x200/F2EAD9/3D4856?text=SC', 'F', 1998, 'SG', 'Singapore', array['Minimal','Earth tones','Linen','Tailored'], 'TROPICAL', true, true, now() - interval '180 days', now()),
  ('00000001-0000-0000-0000-000000000002'::uuid, 'meili',    'Mei Li',       'https://placehold.co/200x200/E5D5E0/3D4856?text=ME', 'F', 1998, 'SG', 'Singapore', array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000003'::uuid, 'serena_x', 'Serena Tan',   'https://placehold.co/200x200/E5D5E0/3D4856?text=SE', 'F', 1998, 'SG', 'Singapore', array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000004'::uuid, 'jia.wen',  'Jia Wen',      'https://placehold.co/200x200/E5D5E0/3D4856?text=JI', 'F', 1998, 'SG', 'Singapore', array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000005'::uuid, 'amelia',   'Amelia Wong',  'https://placehold.co/200x200/E5D5E0/3D4856?text=AM', 'F', 1998, 'JP', 'Tokyo',     array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000006'::uuid, 'anna',     'Anna Park',    'https://placehold.co/200x200/E5D5E0/3D4856?text=AN', 'F', 1998, 'KR', 'Seoul',     array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000007'::uuid, 'lou',      'Lou Chen',     'https://placehold.co/200x200/E5D5E0/3D4856?text=LO', 'F', 1998, 'SG', 'Singapore', array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000008'::uuid, 'kimi',     'Kimi Yamada',  'https://placehold.co/200x200/E5D5E0/3D4856?text=KI', 'F', 1998, 'JP', 'Tokyo',     array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours'),
  ('00000001-0000-0000-0000-000000000009'::uuid, 'navi',     'Navi Singh',   'https://placehold.co/200x200/E5D5E0/3D4856?text=NA', 'F', 1998, 'IN', 'Mumbai',    array['Minimal','Earth tones'],                    'TROPICAL', true, true, now() - interval '120 days', now() - interval '3 hours')
on conflict (user_id) do nothing;

------------------------------------------------------------------------------
-- 2. closet_items — Sophia's 15 pieces (mock id → seed uuid)
--
--   i_dress_linen     -> 02..0001    i_dress_floral    -> 02..0002
--   i_top_silk        -> 02..0003    i_top_tee         -> 02..0004 (PROCESSING)
--   i_top_blouse      -> 02..0005    i_bottom_jeans    -> 02..0006
--   i_bottom_skirt    -> 02..0007    i_bottom_shorts   -> 02..0008 (PROCESSING)
--   i_outer_blazer    -> 02..0009    i_shoe_loafers    -> 02..000a
--   i_shoe_sandals    -> 02..000b    i_shoe_heels      -> 02..000c
--   i_bag_tote        -> 02..000d    i_bag_clutch      -> 02..000e
--   i_acc_scarf       -> 02..000f
--
-- Storage keys follow §6.3: `{user_id}/{item_id}.{ext}`. The blob payloads
-- aren't seeded into Storage by this script; the keys exist so schema-level
-- joins are exercised.
------------------------------------------------------------------------------

insert into public.closet_items (
  item_id, user_id, category, name, description, colors, fabric_guess,
  occasion_tags, weather_tags,
  raw_storage_key, tuned_storage_key, thumbnail_storage_key,
  status, created_at, updated_at
) values
  ('00000002-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'DRESS',     'Cream linen midi',      'Sleeveless A-line in soft cream linen.',     array['#F2EAD9'],            'linen',   array['BRUNCH','CASUAL']::public.occasion[],          array['HOT','WARM']::public.weather_tag[],         '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000001.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000001.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000001.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'DRESS',     'Floral wrap',           'Tea-length wrap in dusty mauve floral.',     array['#E5D5E0'],            'rayon',   array['DATE','WEDDING']::public.occasion[],           array['WARM']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000002.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000002.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000002.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'TOP',       'Ivory silk camisole',   'Bias-cut camisole with thin straps.',        array['#F2EAD9'],            'silk',    array['EVENING','DATE']::public.occasion[],           array['MILD','WARM']::public.weather_tag[],        '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000003.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000003.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000003.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'TOP',       'White boxy tee',        'Heavy cotton tee, slightly cropped.',        array['#FFFFFF'],            'cotton',  array['CASUAL']::public.occasion[],                   array['HOT','WARM']::public.weather_tag[],         '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000004.jpg',  null,                                                                              null,                                                                                  'PROCESSING', now() - interval '1 day',  now() - interval '1 day'),
  ('00000002-0000-0000-0000-000000000005'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'TOP',       'Sage button-down',      'Oversized sage poplin shirt.',                array['#D5DDD0'],            'cotton',  array['WORK','BRUNCH']::public.occasion[],            array['MILD']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000005.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000005.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000005.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000006'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'BOTTOM',    'Indigo straight jeans', 'Mid-rise straight leg in raw indigo.',        array['#3D4856'],            'denim',   array['CASUAL','WORK']::public.occasion[],            array['MILD','COLD']::public.weather_tag[],        '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000006.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000006.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000006.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000007'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'BOTTOM',    'Tan pleated skirt',     'Knee-length pleated skirt in warm tan.',     array['#DCC9B6'],            'wool',    array['WORK','DATE']::public.occasion[],              array['MILD']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000007.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000007.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000007.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-000000000008'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'BOTTOM',    'Linen shorts',          'High-rise tailored shorts in oat linen.',     array['#F2EAD9'],            'linen',   array['BRUNCH','BEACH']::public.occasion[],           array['HOT']::public.weather_tag[],                '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000008.jpg',  null,                                                                              null,                                                                                  'PROCESSING', now() - interval '1 day',  now() - interval '1 day'),
  ('00000002-0000-0000-0000-000000000009'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'OUTERWEAR', 'Tan blazer',            'Single-breasted relaxed blazer.',             array['#DCC9B6'],            'wool',    array['WORK']::public.occasion[],                     array['MILD','COLD']::public.weather_tag[],        '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000009.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000009.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-000000000009.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000a'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'SHOE',      'Black penny loafers',   'Classic leather loafers, broken in.',         array['#1A1A1A'],            'leather', array['WORK','CASUAL']::public.occasion[],            array['MILD','COLD']::public.weather_tag[],        '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000a.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000a.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000a.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000b'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'SHOE',      'Strappy sandals',       'Tan leather flat sandals.',                  array['#DCC9B6'],            'leather', array['BRUNCH','BEACH']::public.occasion[],           array['HOT','WARM']::public.weather_tag[],         '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000b.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000b.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000b.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000c'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'SHOE',      'Mauve kitten heels',    'Pointed-toe slingbacks in dusty mauve.',     array['#E5D5E0'],            'leather', array['DATE','WEDDING','EVENING']::public.occasion[], array['MILD']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000c.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000c.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000c.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000d'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'BAG',       'Cream canvas tote',     'Roomy everyday tote with leather handles.',  array['#F2EAD9'],            'canvas',  array['CASUAL','WORK']::public.occasion[],            array['HOT','WARM','MILD']::public.weather_tag[],  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000d.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000d.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000d.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000e'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'BAG',       'Mauve clutch',          'Small evening clutch in suede mauve.',        array['#E5D5E0'],            'suede',   array['EVENING','WEDDING']::public.occasion[],        array['MILD']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000e.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000e.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000e.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days'),
  ('00000002-0000-0000-0000-00000000000f'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'ACCESSORY', 'Silk neck scarf',       'Cream-and-tan printed silk square.',          array['#F2EAD9','#DCC9B6'],  'silk',    array['BRUNCH','WORK']::public.occasion[],            array['MILD']::public.weather_tag[],               '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000f.jpg',  '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000f.webp', '00000001-0000-0000-0000-000000000001/00000002-0000-0000-0000-00000000000f.thumb.webp', 'READY',      now() - interval '20 days', now() - interval '20 days')
on conflict (item_id) do nothing;

------------------------------------------------------------------------------
-- 3. combinations (5) + combination_items
--   c_sunday_brunch  -> 03..0001
--   c_date_night     -> 03..0002
--   c_office_tue     -> 03..0003
--   c_wedding_guest  -> 03..0004
--   c_easy_weekend   -> 03..0005
------------------------------------------------------------------------------

insert into public.combinations (combo_id, user_id, name, occasion_tags, source, created_at) values
  ('00000003-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Sunday brunch', array['BRUNCH']::public.occasion[],  'TODAY_PICK', now() - interval '2 hours'),
  ('00000003-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Date night',    array['DATE']::public.occasion[],    'CRAFTED',    now() - interval '3 days'),
  ('00000003-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Office tue',    array['WORK']::public.occasion[],    'CRAFTED',    now() - interval '5 days'),
  ('00000003-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Wedding guest', array['WEDDING']::public.occasion[], 'STELLA',     now() - interval '8 days'),
  ('00000003-0000-0000-0000-000000000005'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Easy weekend',  array['CASUAL']::public.occasion[],  'CRAFTED',    now() - interval '10 days')
on conflict (combo_id) do nothing;

insert into public.combination_items (combo_id, item_id, position) values
  -- Sunday brunch: linen midi + sandals + tote
  ('00000003-0000-0000-0000-000000000001'::uuid, '00000002-0000-0000-0000-000000000001'::uuid, 0),
  ('00000003-0000-0000-0000-000000000001'::uuid, '00000002-0000-0000-0000-00000000000b'::uuid, 1),
  ('00000003-0000-0000-0000-000000000001'::uuid, '00000002-0000-0000-0000-00000000000d'::uuid, 2),
  -- Date night: floral wrap + heels + clutch
  ('00000003-0000-0000-0000-000000000002'::uuid, '00000002-0000-0000-0000-000000000002'::uuid, 0),
  ('00000003-0000-0000-0000-000000000002'::uuid, '00000002-0000-0000-0000-00000000000c'::uuid, 1),
  ('00000003-0000-0000-0000-000000000002'::uuid, '00000002-0000-0000-0000-00000000000e'::uuid, 2),
  -- Office tue: blouse + jeans + loafers + blazer
  ('00000003-0000-0000-0000-000000000003'::uuid, '00000002-0000-0000-0000-000000000005'::uuid, 0),
  ('00000003-0000-0000-0000-000000000003'::uuid, '00000002-0000-0000-0000-000000000006'::uuid, 1),
  ('00000003-0000-0000-0000-000000000003'::uuid, '00000002-0000-0000-0000-00000000000a'::uuid, 2),
  ('00000003-0000-0000-0000-000000000003'::uuid, '00000002-0000-0000-0000-000000000009'::uuid, 3),
  -- Wedding guest: floral wrap + heels + clutch + scarf
  ('00000003-0000-0000-0000-000000000004'::uuid, '00000002-0000-0000-0000-000000000002'::uuid, 0),
  ('00000003-0000-0000-0000-000000000004'::uuid, '00000002-0000-0000-0000-00000000000c'::uuid, 1),
  ('00000003-0000-0000-0000-000000000004'::uuid, '00000002-0000-0000-0000-00000000000e'::uuid, 2),
  ('00000003-0000-0000-0000-000000000004'::uuid, '00000002-0000-0000-0000-00000000000f'::uuid, 3),
  -- Easy weekend: tee + shorts + sandals
  ('00000003-0000-0000-0000-000000000005'::uuid, '00000002-0000-0000-0000-000000000004'::uuid, 0),
  ('00000003-0000-0000-0000-000000000005'::uuid, '00000002-0000-0000-0000-000000000008'::uuid, 1),
  ('00000003-0000-0000-0000-000000000005'::uuid, '00000002-0000-0000-0000-00000000000b'::uuid, 2)
on conflict (combo_id, item_id) do nothing;

------------------------------------------------------------------------------
-- 4. selfies — 2 of Sophia's allotted 5.
------------------------------------------------------------------------------

insert into public.selfies (selfie_id, user_id, storage_key, uploaded_at) values
  ('00000004-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001/00000004-0000-0000-0000-000000000001.jpg', now() - interval '7 days'),
  ('00000004-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001/00000004-0000-0000-0000-000000000002.jpg', now() - interval '2 days')
on conflict (selfie_id) do nothing;

------------------------------------------------------------------------------
-- 5. friendships — Sophia friends with the first 5 (meili, serena, jia, amelia, anna).
--
-- Sophia's uuid (`...0001`) sorts smallest, so under the canonical
-- (user_a < user_b) ordering Sophia is always user_a. The is_friend()
-- helper handles either direction at read time.
------------------------------------------------------------------------------

insert into public.friendships (user_a, user_b, created_at) values
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, now() - interval '30 days'),
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, now() - interval '30 days'),
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000004'::uuid, now() - interval '30 days'),
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000005'::uuid, now() - interval '30 days'),
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000006'::uuid, now() - interval '30 days')
on conflict (user_a, user_b) do nothing;

------------------------------------------------------------------------------
-- 6. friend_requests — one inbound (kimi → sophia), one outbound (sophia → navi).
------------------------------------------------------------------------------

insert into public.friend_requests (from_user_id, to_user_id, status, created_at) values
  ('00000001-0000-0000-0000-000000000008'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'PENDING', now() - interval '20 hours'),
  ('00000001-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000009'::uuid, 'PENDING', now() - interval '30 hours')
on conflict (from_user_id, to_user_id) do nothing;

------------------------------------------------------------------------------
-- 7. ootd_posts — Sophia's brunch + 5 friends' looks (= 6 total).
--
-- Friends' OOTDs each get a placeholder combination owned by that friend
-- (no combination_items — the mock-server fakes it the same way).
------------------------------------------------------------------------------

insert into public.combinations (combo_id, user_id, name, occasion_tags, source, created_at) values
  ('00000003-0000-0000-0000-0000000000a1'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 'sage shirt + jeans', array['CASUAL']::public.occasion[],  'CRAFTED', now() - interval '5 hours'),
  ('00000003-0000-0000-0000-0000000000a2'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, 'office tuesday',     array['WORK']::public.occasion[],    'CRAFTED', now() - interval '5 hours'),
  ('00000003-0000-0000-0000-0000000000a3'::uuid, '00000001-0000-0000-0000-000000000005'::uuid, 'tokyo evening',      array['EVENING']::public.occasion[], 'CRAFTED', now() - interval '5 hours'),
  ('00000003-0000-0000-0000-0000000000a4'::uuid, '00000001-0000-0000-0000-000000000007'::uuid, 'beach pull',         array['CASUAL']::public.occasion[],  'CRAFTED', now() - interval '5 hours'),
  ('00000003-0000-0000-0000-0000000000a5'::uuid, '00000001-0000-0000-0000-000000000004'::uuid, 'date night',         array['EVENING']::public.occasion[], 'CRAFTED', now() - interval '5 hours')
on conflict (combo_id) do nothing;

insert into public.ootd_posts (
  ootd_id, user_id, combo_id, selfie_id, caption, location_name,
  try_on_storage_key, fallback_outfit_card_storage_key,
  visibility, visibility_targets, created_at
) values
  ('00000005-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, '00000003-0000-0000-0000-000000000001'::uuid, '00000004-0000-0000-0000-000000000001'::uuid, 'brunch in the cream slip ☼', 'Tiong Bahru, Singapore', '00000001-0000-0000-0000-000000000001/00000005-0000-0000-0000-000000000001.webp', '00000001-0000-0000-0000-000000000001/00000005-0000-0000-0000-000000000001.fallback.webp', 'FRIENDS', '{}'::uuid[], now() - interval '2 hours'),
  ('00000005-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, '00000003-0000-0000-0000-0000000000a1'::uuid, null,                                          'sunday slow ✦',              'Singapore',              '00000001-0000-0000-0000-000000000002/00000005-0000-0000-0000-000000000002.webp', '00000001-0000-0000-0000-000000000002/00000005-0000-0000-0000-000000000002.fallback.webp', 'PUBLIC',  '{}'::uuid[], now() - interval '5 hours'),
  ('00000005-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, '00000003-0000-0000-0000-0000000000a2'::uuid, null,                                          'back to navy',               'Singapore',              '00000001-0000-0000-0000-000000000003/00000005-0000-0000-0000-000000000003.webp', '00000001-0000-0000-0000-000000000003/00000005-0000-0000-0000-000000000003.fallback.webp', 'PUBLIC',  '{}'::uuid[], now() - interval '5 hours'),
  ('00000005-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000005'::uuid, '00000003-0000-0000-0000-0000000000a3'::uuid, null,                                          'shibuya nights',             'Tokyo',                  '00000001-0000-0000-0000-000000000005/00000005-0000-0000-0000-000000000004.webp', '00000001-0000-0000-0000-000000000005/00000005-0000-0000-0000-000000000004.fallback.webp', 'PUBLIC',  '{}'::uuid[], now() - interval '5 hours'),
  ('00000005-0000-0000-0000-000000000005'::uuid, '00000001-0000-0000-0000-000000000007'::uuid, '00000003-0000-0000-0000-0000000000a4'::uuid, null,                                          'salt + linen',               'Bali',                   '00000001-0000-0000-0000-000000000007/00000005-0000-0000-0000-000000000005.webp', '00000001-0000-0000-0000-000000000007/00000005-0000-0000-0000-000000000005.fallback.webp', 'PUBLIC',  '{}'::uuid[], now() - interval '5 hours'),
  ('00000005-0000-0000-0000-000000000006'::uuid, '00000001-0000-0000-0000-000000000004'::uuid, '00000003-0000-0000-0000-0000000000a5'::uuid, null,                                          '',                           'Singapore',              '00000001-0000-0000-0000-000000000004/00000005-0000-0000-0000-000000000006.webp', '00000001-0000-0000-0000-000000000004/00000005-0000-0000-0000-000000000006.fallback.webp', 'PUBLIC',  '{}'::uuid[], now() - interval '5 hours')
on conflict (ootd_id) do nothing;

insert into public.ootd_reactions (ootd_id, user_id, type, created_at) values
  ('00000005-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, '♡', now() - interval '1 hour')
on conflict (ootd_id, user_id) do nothing;

------------------------------------------------------------------------------
-- 8. hangout — Brunch crew (active, owner = Sophia).
------------------------------------------------------------------------------

insert into public.hangouts (hangout_id, owner_id, name, starts_at, expires_at, location_name, status, created_at) values
  ('00000006-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Brunch crew', now() + interval '2 hours', now() + interval '8 hours', 'Tiong Bahru', 'ACTIVE', now() - interval '20 hours')
on conflict (hangout_id) do nothing;

insert into public.hangout_members (hangout_id, user_id, role, invite_status, shared_combo_id, shared_at, joined_at) values
  ('00000006-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'OWNER',  'JOINED',  '00000003-0000-0000-0000-000000000001'::uuid, now() - interval '1 hour', now() - interval '20 hours'),
  ('00000006-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 'MEMBER', 'JOINED',  null,                                          null,                       now() - interval '18 hours'),
  ('00000006-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, 'MEMBER', 'INVITED', null,                                          null,                       now() - interval '20 hours')
on conflict (hangout_id, user_id) do nothing;

------------------------------------------------------------------------------
-- 9. chat threads + participants + a few messages
--   1 STELLA   -> 07..0001
--   1 HANGOUT  -> 07..0002 (-> hangout 06..0001)
--   1 GROUP    -> 07..0003 (Wedding squad)
--   4 DIRECT   -> 07..0004..0007 (meili, serena, jia, amelia)
------------------------------------------------------------------------------

insert into public.chat_threads (thread_id, type, hangout_id, name, last_message_at, created_at) values
  ('00000007-0000-0000-0000-000000000001'::uuid, 'STELLA',  null,                                          'Stella',           now() - interval '1 hour',     now() - interval '30 days'),
  ('00000007-0000-0000-0000-000000000002'::uuid, 'HANGOUT', '00000006-0000-0000-0000-000000000001'::uuid,  'Brunch crew · 4',  now() - interval '12 minutes', now() - interval '1 day'),
  ('00000007-0000-0000-0000-000000000003'::uuid, 'GROUP',   null,                                          'Wedding squad · 6', now() - interval '1 hour',    now() - interval '14 days'),
  ('00000007-0000-0000-0000-000000000004'::uuid, 'DIRECT',  null,                                          null,               now() - interval '3 hours',    now() - interval '60 days'),
  ('00000007-0000-0000-0000-000000000005'::uuid, 'DIRECT',  null,                                          null,               now() - interval '1 day',      now() - interval '50 days'),
  ('00000007-0000-0000-0000-000000000006'::uuid, 'DIRECT',  null,                                          null,               now() - interval '2 days',     now() - interval '45 days'),
  ('00000007-0000-0000-0000-000000000007'::uuid, 'DIRECT',  null,                                          null,               now() - interval '3 days',     now() - interval '40 days')
on conflict (thread_id) do nothing;

insert into public.chat_thread_participants (thread_id, user_id, unread_count, last_read_at) values
  -- Stella (Sophia only)
  ('00000007-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 0, now() - interval '1 hour'),
  -- Hangout
  ('00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 1, now() - interval '20 hours'),
  ('00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 0, now() - interval '12 minutes'),
  ('00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, 0, now() - interval '12 minutes'),
  -- Wedding squad
  ('00000007-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 0, now() - interval '1 hour'),
  ('00000007-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 0, now() - interval '1 hour'),
  ('00000007-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000004'::uuid, 0, now() - interval '1 hour'),
  ('00000007-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000005'::uuid, 0, now() - interval '1 hour'),
  ('00000007-0000-0000-0000-000000000003'::uuid, '00000001-0000-0000-0000-000000000006'::uuid, 0, now() - interval '1 hour'),
  -- DM meili
  ('00000007-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 0, now() - interval '3 hours'),
  ('00000007-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 0, now() - interval '3 hours'),
  -- DM serena
  ('00000007-0000-0000-0000-000000000005'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 0, now() - interval '1 day'),
  ('00000007-0000-0000-0000-000000000005'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, 0, now() - interval '1 day'),
  -- DM jia
  ('00000007-0000-0000-0000-000000000006'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 2, now() - interval '5 days'),
  ('00000007-0000-0000-0000-000000000006'::uuid, '00000001-0000-0000-0000-000000000004'::uuid, 0, now() - interval '2 days'),
  -- DM amelia
  ('00000007-0000-0000-0000-000000000007'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 0, now() - interval '3 days'),
  ('00000007-0000-0000-0000-000000000007'::uuid, '00000001-0000-0000-0000-000000000005'::uuid, 0, now() - interval '3 days')
on conflict (thread_id, user_id) do nothing;

insert into public.chat_messages (message_id, thread_id, sender_id, kind, text, ref_id, created_at) values
  -- Hangout chatter
  ('00000008-0000-0000-0000-000000000001'::uuid, '00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'TEXT',         '11 at the usual?',                  null,                                            now() - interval '20 hours'),
  ('00000008-0000-0000-0000-000000000002'::uuid, '00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000003'::uuid, 'TEXT',         'yep ✦',                              null,                                            now() - interval '19 hours'),
  ('00000008-0000-0000-0000-000000000003'::uuid, '00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'COMBINATION',  null,                                 '00000003-0000-0000-0000-000000000001',         now() - interval '1 hour'),
  ('00000008-0000-0000-0000-000000000004'::uuid, '00000007-0000-0000-0000-000000000002'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 'TEXT',         'yes I''m wearing the cream linen!', null,                                            now() - interval '12 minutes'),
  -- DM meili
  ('00000008-0000-0000-0000-000000000005'::uuid, '00000007-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 'OOTD',         null,                                 '00000005-0000-0000-0000-000000000001',         now() - interval '4 hours'),
  ('00000008-0000-0000-0000-000000000006'::uuid, '00000007-0000-0000-0000-000000000004'::uuid, '00000001-0000-0000-0000-000000000002'::uuid, 'TEXT',         'loved your OOTD ♡',                 null,                                            now() - interval '3 hours')
on conflict (message_id) do nothing;

------------------------------------------------------------------------------
-- 10. Stella conversation + 5 messages
--   Mirrors apps/mobile/components/stella/mocks.ts — same beats so the
--   mobile screen can lift straight from the API once wired up.
------------------------------------------------------------------------------

insert into public.stella_conversations (convo_id, user_id, title, created_at, last_message_at) values
  ('00000009-0000-0000-0000-000000000001'::uuid, '00000001-0000-0000-0000-000000000001'::uuid, 'Sunday brunch · what to wear', now() - interval '2 hours', now() - interval '1 hour')
on conflict (convo_id) do nothing;

insert into public.stella_messages (message_id, convo_id, role, text, created_at) values
  ('0000000a-0000-0000-0000-000000000001'::uuid, '00000009-0000-0000-0000-000000000001'::uuid, 'ASSISTANT', 'morning, sophia ☼ brunch at 11 in tiong bahru — want me to put together a look?',                  now() - interval '2 hours'),
  ('0000000a-0000-0000-0000-000000000002'::uuid, '00000009-0000-0000-0000-000000000001'::uuid, 'USER',      'Yes! Casual but cute. It''s hot today.',                                                          now() - interval '2 hours'),
  ('0000000a-0000-0000-0000-000000000003'::uuid, '00000009-0000-0000-0000-000000000001'::uuid, 'ASSISTANT', 'pulling from your closet: linen midi + woven mules. straw bag for the heat.',                     now() - interval '2 hours'),
  ('0000000a-0000-0000-0000-000000000004'::uuid, '00000009-0000-0000-0000-000000000001'::uuid, 'USER',      'Love it. What if it rains?',                                                                      now() - interval '90 minutes'),
  ('0000000a-0000-0000-0000-000000000005'::uuid, '00000009-0000-0000-0000-000000000001'::uuid, 'ASSISTANT', 'easy — swap the mules for your white sneakers and grab the olive trench. still cute, still you ♡', now() - interval '1 hour')
on conflict (message_id) do nothing;
