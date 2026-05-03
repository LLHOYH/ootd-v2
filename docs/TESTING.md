# Testing Mei

How to run the app end-to-end against live data, on Mac (web) or iPhone
(Expo Go).

The app has four backend services + a mobile client + hosted Supabase.
Most days you only need to remember three commands.

---

## TL;DR — three terminals on Mac

```bash
# Terminal 1 — backend services
pnpm services

# Terminal 2 — fill 10 test users with closets, friends, DMs (~30s)
pnpm seed:all

# Terminal 3 — Expo for web
pnpm mobile:web
```

Then open the URL Expo prints (usually `http://localhost:8081`) and sign
in as any account from [Test accounts](#test-accounts).

That's it. Read the rest only if something doesn't work or you want to
test on iOS.

---

## Prerequisites (one-time setup)

Each backend service reads its own `.env` (gitignored). Already set up
on the original dev machine — verify with:

```bash
ls services/api/.env services/stylist/.env services/image-worker/.env services/notifier/.env apps/mobile/.env
```

Each missing file → copy its `.env.example` next to it and fill in the
values from your Supabase dashboard. The shared secrets are documented
in [docs/CREDENTIALS.md](./CREDENTIALS.md).

```bash
pnpm install   # if you haven't already
```

---

## Mac — web (fastest path)

### 1. Boot backend services

```bash
pnpm services
```

This runs `scripts/dev.sh`, which sources each service's `.env` in a
subshell and boots all four. Wait for the four `ready` lines:

```
[dev.sh] api          ready http://127.0.0.1:3001/_health
[dev.sh] stylist      ready http://127.0.0.1:8080/health
[dev.sh] image-worker ready http://127.0.0.1:8090/health
[dev.sh] notifier     ready http://127.0.0.1:8082/health
```

`Ctrl+C` kills them all cleanly.

Logs land in `/tmp/mei-<service>.log` and tail to your terminal in
colour. If a service dies, you'll see it in the prefixed stream.

To boot only some services:

```bash
pnpm services:api          # just the api Lambda harness
pnpm services:stylist      # just Stella
pnpm services:image-worker # just the upload worker
pnpm services:notifier     # just the push fanout
```

To probe health from another shell:

```bash
pnpm services:health
```

### 2. Seed the test fixture

```bash
pnpm seed:all
```

Idempotent — re-runnable any time, wipes + re-inserts cleanly in ~30s.

Creates 10 test users with realistic closets (10 items for `lloyd`, ~3
for everyone else), 6 combinations, 9 OOTD posts, 9 friendships, 3
friend requests across statuses, 3 DM threads with backdated messages
and unread counts, and 7 OOTD reactions. See
[scripts/seed/dummy-multiuser.json](../scripts/seed/dummy-multiuser.json)
for the full spec.

If you want to seed only your own account (the simpler 10-item fixture
that doesn't touch anyone else):

```bash
pnpm seed
```

### 3. Open the app

```bash
pnpm mobile:web
```

Opens Expo's web bundler on `http://localhost:8081`. Sign in as any
[Test account](#test-accounts).

---

## iPhone — Expo Go

Same backend, but the mobile client needs to reach your Mac over Wi-Fi
instead of `localhost`.

### 1. Find your Mac's LAN IP

```bash
ipconfig getifaddr en0    # Wi-Fi
# or: ipconfig getifaddr en1  for Ethernet
```

Example: `192.168.1.42`.

### 2. Point the mobile app at your Mac

Edit `apps/mobile/.env` and replace every `127.0.0.1` with that IP:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
EXPO_PUBLIC_STYLIST_URL=http://192.168.1.42:8080
EXPO_PUBLIC_IMAGE_WORKER_URL=http://192.168.1.42:8090
```

`EXPO_PUBLIC_SUPABASE_URL` stays pointing at hosted Supabase — don't
change that one.

### 3. Boot backend + seed (same as Mac)

```bash
pnpm services
pnpm seed:all      # only if your fixture has drifted
```

### 4. Start Expo for native

```bash
pnpm mobile:start
```

A QR code appears.

### 5. On your iPhone

- Same Wi-Fi as the Mac
- Install **Expo Go** from the App Store
- Open Camera → point at the QR code → tap the banner → Expo Go launches the app

---

## Test accounts

After `pnpm seed:all`, every account is a real Supabase auth user,
already email-confirmed.

| Account | Password | Role |
|---|---|---|
| `llhoyh01@gmail.com` | (your real password) | preserved real account |
| `alice@meitest.local` | `alice-pw-2026` | accepted friend of lloyd |
| `bea@meitest.local` | `bea-pw-2026` | accepted friend of lloyd |
| `hana@meitest.local` | `hana-pw-2026` | accepted friend of lloyd |
| `ivy@meitest.local` | `ivy-pw-2026` | accepted friend of lloyd |
| `cara@meitest.local` | `cara-pw-2026` | **PENDING** request → lloyd |
| `dani@meitest.local` | `dani-pw-2026` | lloyd has **PENDING** request → dani |
| `gigi@meitest.local` | `gigi-pw-2026` | DECLINED request |
| `evie@meitest.local` | `evie-pw-2026` | not friends; surfaces in suggested |
| `fei@meitest.local` | `fei-pw-2026` | not friends; surfaces in suggested |

Two accounts open in two browser windows = full multi-user testing
without needing two devices.

---

## Verification flow (5 minutes, end-to-end)

Sign in as `llhoyh01@gmail.com` and walk through:

1. **Today** → today's pick + community looks render with photos
2. **Closet** → 10 items with thumbnails. Switch to Combinations
   filter → 6 saved looks → tap one → share modal opens
3. **Friends** tab → OOTD feed shows posts from your friends
4. **You** → Add friends → **Pending** tab shows 1 inbound (cara) +
   1 outbound (dani) + 1 declined (gigi)
5. **Suggested** tab → evie + fei (friends-of-friends)
6. **Chats** → 3 threads, badge count `5` (2 from alice + 3 from hana)
7. **Open Stella** → real Claude reply, she calls her tools and reads
   your closet
8. Sign out, sign in as `alice@meitest.local` → completely different
   feed, inbox, and friend graph

---

## Common gotchas

**`Missing required env var: SUPABASE_URL`** in a service log →
You started a service with a shell that didn't source its `.env`.
Use `pnpm services` (which sources per-service automatically) instead
of `pnpm --filter @mei/api serve` directly.

**`EADDRINUSE: address already in use :::3001`** (or 8080 / 8090 /
8082) → another instance of the service is still running. Kill it:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3001|8080|8090|8082)'
kill <PID>
```

Or just `pkill -f "tsx src"` to nuke all the dev servers and restart.

**Expo on port 8081 conflicts with image-worker** — fixed in PR #48.
image-worker now defaults to 8090. If your `apps/mobile/.env` still
points at `8081`, update it to `8090`.

**Closet items show empty thumbnails on web** — the api `signDownloadUrl`
should now read the actual `tuned_storage_key` column (PR #51). If you
see this, pull `main` and restart `pnpm services`.

**iPhone won't load images / API requests time out** — usually means
the LAN IP changed (you moved networks). Update `apps/mobile/.env`
and reload Expo.

**Stella replies feel slow** — that's real Claude streaming with tool
calls. Each reply takes ~5–15 seconds. To test offline / free, comment
out `ANTHROPIC_API_KEY` in `services/stylist/.env` and Stella falls
back to MockProvider with canned text.

**Hotel Wi-Fi blocks iPhone ↔ Mac** — most public networks isolate
clients. Use a personal hotspot from your phone instead, or stay on
home Wi-Fi.

---

## Re-running tests

`pnpm seed:all` is destructive: it wipes every test user's closet,
combos, OOTDs, DMs, and storage objects, then re-inserts from the
spec. **It does not delete your `llhoyh01@gmail.com` auth row** — only
the data it owns.

If you've sent DMs as alice mid-session and re-seed, those DMs are
gone. Friendships from the spec are preserved across re-runs (they're
in the spec).

If you want to start completely fresh including all test auth users,
nuke them via the Supabase dashboard: Authentication → Users → filter
on `@meitest.local` → bulk delete.

---

## Smoke scripts (CI-style end-to-end tests)

Each backend domain has a smoke script that runs against the live
Supabase project. Useful when you suspect a regression:

```bash
# from repo root, with services running
pnpm --filter @mei/api exec tsx ../../scripts/smoke-backend.ts          # auth + RLS sanity
pnpm --filter @mei/api exec tsx ../../scripts/smoke-today-flow.ts       # /today
pnpm --filter @mei/api exec tsx ../../scripts/smoke-closet-flow.ts      # /closet/items + /closet/combinations
pnpm --filter @mei/api exec tsx ../../scripts/smoke-craft-look.ts       # POST /closet/combinations
pnpm --filter @mei/api exec tsx ../../scripts/smoke-friends-flow.ts     # /friends/*
pnpm --filter @mei/api exec tsx ../../scripts/smoke-chats-flow.ts       # /chat/* + Realtime
pnpm --filter @mei/api exec tsx ../../scripts/smoke-stella-flow.ts      # SSE → real Claude
pnpm --filter @mei/api exec tsx ../../scripts/smoke-ootd-feed.ts        # /ootd/feed visibility (4 lanes)
pnpm --filter @mei/api exec tsx ../../scripts/smoke-ootd-share.ts       # POST /ootd
pnpm --filter @mei/api exec tsx ../../scripts/smoke-image-worker.ts     # /webhooks/storage
pnpm --filter @mei/api exec tsx ../../scripts/smoke-notifier-flow.ts    # /webhooks/notify
pnpm --filter @mei/api exec tsx ../../scripts/smoke-closet-upload-integration.ts  # full upload pipeline
pnpm --filter @mei/api exec tsx ../../scripts/smoke-stylist-sse.ts      # boots stylist + tests SSE
pnpm --filter @mei/api exec tsx ../../scripts/smoke-you-profile.ts      # /me-style direct supabase reads
```

Every smoke is self-cleaning: it creates throwaway users, runs steps,
and `admin.deleteUser`s on exit. Safe to run any time.

---

## Ports cheat sheet

| Service | Port | Health |
|---|---|---|
| api | `3001` | `/_health` |
| stylist | `8080` | `/health` |
| image-worker | `8090` | `/health` |
| notifier | `8082` | `/health` |
| Expo (web) | `8081` | (visit in browser) |
| Expo (Metro) | `19000` (auto) | — |
