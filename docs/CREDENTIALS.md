# Credentials map

Every secret Mei needs, where it goes, and which feature it unblocks. Local-dev defaults are committed where safe; everything sensitive ships through dashboards or CI secret stores.

## Top-line summary

| Priority | Provider | What I need from you | Unblocks |
|---|---|---|---|
| 1 | Supabase | Project URL + anon + service-role + JWT secret + access token | Real DB / auth / storage; CI deploy |
| 2 | Anthropic | API key with Sonnet access | Real Stella conversations + closet vision |
| 3 | Render | Account connected to GitHub | Stella HTTP service deploy |
| 4 | Expo | Project ID | Push notifications |
| 5 | Replicate | API token | Closet image cleanup + try-on photo |
| 6 | OpenWeatherMap | API key | Real weather on `/today` |
| later | Apple / Google | OAuth client IDs + secrets, Apple Push key | Native sign-in + push to native builds |
| optional | AWS | Account + IAM user | Only if image-worker / notifier stay on Lambda |

Local-dev needs **none** of these. `supabase start` + the existing mock-server gives you the full app loop offline.

---

## 1. Supabase

The biggest unlock. Without it, nothing past the local mock loop works.

### Steps

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine for staging).
2. Create a project in **`ap-northeast-1` (Tokyo)** per `SPEC §13.1`.
3. From the dashboard pick up four values (Settings → API):

| Var name | Where it goes | Where in dashboard |
|---|---|---|
| `SUPABASE_URL` | Mobile, api, stylist, GitHub Actions | Project URL |
| `SUPABASE_ANON_KEY` | Mobile (`EXPO_PUBLIC_*`) + api | API → anon/public |
| `SUPABASE_SERVICE_ROLE_KEY` | api + stylist + GitHub Actions | API → service_role (**SECRET**) |
| `SUPABASE_JWT_SECRET` | api + stylist + GitHub Actions | API → JWT Settings |

4. Generate a **CLI access token** (Account → Access Tokens) → store as `SUPABASE_ACCESS_TOKEN` in **GitHub Actions secrets** so `supabase db push` runs from CI.

### Where each var lives

| Var | `apps/mobile/.env` | `services/api/.env` | `services/stylist/.env` | Render dashboard | GitHub Actions secrets |
|---|---|---|---|---|---|
| `SUPABASE_URL` | as `EXPO_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | ✓ |
| `SUPABASE_ANON_KEY` | as `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✓ | — | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✓ | ✓ | ✓ | ✓ |
| `SUPABASE_JWT_SECRET` | — | ✓ | ✓ | ✓ | ✓ |
| `SUPABASE_ACCESS_TOKEN` | — | — | — | — | ✓ (CLI auth) |

Anon key is fine to ship in the bundle — RLS does the work. Service-role bypasses RLS and **must never** reach the client.

---

## 2. Anthropic

### Steps

1. Sign up at [console.anthropic.com](https://console.anthropic.com).
2. Settings → API Keys → create.
3. Confirm Sonnet access on your tier.

### Where it goes

| Var | `services/stylist/.env` | Render dashboard | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | optional (mock-mode by default) | required for real | When unset, `MockProvider` runs end-to-end |
| `STELLA_LLM_MODE` | `real` or `mock` | `real` in prod | Auto-defaults to `real` if a key is present |

Adding the key + flipping `STELLA_LLM_MODE=real` is the only switch needed to make Stella real.

---

## 3. Render (hosting for Stella)

### Steps

1. Sign up at [render.com](https://render.com).
2. New → Blueprint → connect the `LLHOYH/ootd-v2` repo. Render reads `services/stylist/render.yaml` automatically.
3. In the dashboard, set the four `sync: false` env vars listed in `render.yaml`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `ANTHROPIC_API_KEY` (paste from #2)
4. Region defaults to `singapore`. Revisit when Render adds Tokyo.
5. After first deploy, Render gives you a URL like `https://mei-stylist.onrender.com`. The mobile app needs that as `EXPO_PUBLIC_STYLIST_BASE_URL` (frontend wiring branch will introduce this var when we wire it up).

No file changes needed — `render.yaml` is already committed.

---

## 4. Expo Push

### Steps

1. Sign up at [expo.dev](https://expo.dev) (the same account you'll use for EAS Build).
2. Create a project → note the **project ID** (looks like a UUID).
3. For native push later: upload your Apple Push key (.p8) + Google service account JSON in the Expo dashboard.

### Where it goes

| Var | Mobile (`apps/mobile/app.json`) | GitHub Actions secrets |
|---|---|---|
| Expo project ID | `expo.extra.eas.projectId` (no env needed) | — |
| `EXPO_TOKEN` | — | required if CI builds via EAS |

Push fan-out from `services/notifier` (Wave 2d, not yet built) uses the public Expo Push API and doesn't need a long-lived secret.

---

## 5. Replicate (image cleanup + try-on)

### Steps

1. Sign up at [replicate.com](https://replicate.com).
2. Account → API tokens → create.

### Where it goes

| Var | Used by | Notes |
|---|---|---|
| `REPLICATE_API_TOKEN` | `services/image-worker` (Wave 2d) | Background-removal + studio-light pass on closet uploads |

Try-on model selection is `SPEC §14 OQ-2` — deferred until P1.

---

## 6. OpenWeatherMap (real weather on Today)

Optional. The handler at `services/api/src/handlers/today/weather.ts` ships a stub that returns plausible-looking values; the real thing is a one-liner away.

| Var | Used by | Notes |
|---|---|---|
| `OPENWEATHER_API_KEY` | api `/today` | Free tier: 60 req/min, plenty for Mei |

---

## 7. Apple / Google OAuth (when you ship native sign-in)

Currently scaffolded in `supabase/config.toml` with `enabled = false` and `# TODO(secrets)` placeholders. Email + magic-link sign-in works without these.

### Apple

1. Apple Developer account → Certificates, IDs & Profiles.
2. Create a **Services ID** (the OAuth client) and a **Sign in with Apple key** (.p8).
3. Note: services ID, key ID, team ID, private key.

### Google

1. Google Cloud Console → OAuth 2.0 client ID (web application).
2. Note: client ID + secret.

### Where they go

| Var | Where |
|---|---|
| `SUPABASE_AUTH_APPLE_CLIENT_ID` | Supabase dashboard → Auth → Providers → Apple |
| `SUPABASE_AUTH_APPLE_SECRET` | same |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID` | Supabase dashboard → Auth → Providers → Google |
| `SUPABASE_AUTH_GOOGLE_SECRET` | same |

Then flip `enabled = true` in `supabase/config.toml` and re-run `supabase db push` (or just toggle in the dashboard for hosted).

---

## 8. AWS (optional — only if image-worker + notifier stay on Lambda)

`docs/feature-breakdown.md` Wave 2d still plans these as AWS Lambdas. Alternative: run them as Supabase Edge Functions or Render cron jobs and skip AWS entirely.

If you go AWS:

| Var | Where | Notes |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | GitHub Actions secrets | Deploy user with Lambda + IAM permissions |
| `AWS_SECRET_ACCESS_KEY` | GitHub Actions secrets | |
| `AWS_REGION` | CI env | `ap-northeast-1` (matches Supabase region) |

If you'd rather skip AWS, tell me and I'll re-target Wave 2d to Edge Functions.

---

## Where secrets get configured, by environment

| Environment | Secret store | Notes |
|---|---|---|
| Local dev | `apps/mobile/.env`, `services/api/.env`, `services/stylist/.env` | All gitignored (`.gitignore` covers `.env` and `.env.*` except `.env.example`) |
| GitHub Actions (CI) | repo Settings → Secrets and variables → Actions | Used by the migration-deploy job once `feat/supabase-deploy-staging` lands |
| Hosted Stella runtime | Render dashboard → service → Environment | `render.yaml` lists names with `sync: false` |
| Hosted Supabase (DB/Auth) | Supabase dashboard → Auth → Providers (for OAuth) | Other vars come back from `supabase status` / dashboard |
| Mobile app build | EAS Build secrets via `eas.json` (when EAS is configured) | `EXPO_PUBLIC_*` vars get inlined at build time |

## Quickstart paths

**Just want to demo locally:** copy each `.env.example` → `.env`, run `supabase start`, run `pnpm mobile:web`. No external services needed.

**Want a real backend:** Supabase (#1) + Anthropic (#2) + Render (#3). That's the minimum for end-to-end real-data flow.

**Want push notifications:** add Expo (#4).

**Want closet auto-tagging:** add Replicate (#5).

**Native sign-in:** Apple/Google later when you ship a native build.
