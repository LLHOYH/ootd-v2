# @mei/stylist

Stella the AI stylist. Long-lived **Node HTTP service** on **Render** with
SSE streaming and **Postgres-backed persistence** via Supabase. Anthropic
Claude (Sonnet tier). See `SPEC.md §8`.

## Architecture

```
Dockerfile            Multi-stage build (pnpm → tsx)
render.yaml           Render web-service spec (committed; not auto-applied)
src/
  index.ts            Service bootstrap (loadConfig + buildServer + listen)
  server.ts           Fastify app factory, health probe, error handler
  routes/
    stellaMessages.ts POST /stella/conversations/:convoId/messages → SSE
  lib/
    supabase.ts       Memoised service-role SupabaseClient
    auth.ts           Bearer-token verification (jose, HS256, aud=authenticated)
  config.ts           Env loader (Supabase + LLM mode)
  agent/
    runStella.ts      Top-level orchestrator: tool loop + persistence
    systemPrompt.ts   STELLA_SYSTEM_PROMPT — verbatim from SPEC §8.2
    tools.ts          Seven tool definitions — verbatim from SPEC §8.3
    toolHandlers.ts   Postgres-backed handlers + dispatcher
  llm/
    provider.ts       LLMProvider interface + LLMEvent union
    anthropic.ts      Real Anthropic streaming impl
    mock.ts           Deterministic stub for tests / local dev
    factory.ts        getProvider() — mock-by-default
  store/
    conversationStore.ts  Postgres CRUD + IConversationStore + summarizeAndTruncate
  cost/
    tracker.ts        Per-message cost log + $0.10 mean alert (§8.4)
scripts/
  smoke.ts            Mock-provider end-to-end run with an in-memory store
```

## Endpoints

- `GET /health` — liveness probe (`{ ok: true, service: '@mei/stylist' }`).
- `POST /stella/conversations/:convoId/messages` — SSE stream.
  - Auth: `Authorization: Bearer <Supabase access token>`
  - Body: `{ "text": "morning! what should I wear?" }`
  - Response: `text/event-stream` of `StellaSseEvent` JSON frames, terminated
    with `data: [DONE]\n\n`.

## Environment variables

| Var | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key (bypasses RLS). |
| `SUPABASE_JWT_SECRET` | yes | HS256 secret used to verify caller JWTs. |
| `ANTHROPIC_API_KEY` | no | If set, the real provider is used. |
| `STELLA_LLM_MODE` | no | `'real'` or `'mock'`. Forces the provider regardless of key presence. |
| `PORT` | no | TCP port (default `8080`; Render sets this automatically). |
| `LOG_LEVEL` | no | Pino log level (default `info`). |

If `STELLA_LLM_MODE` is unset and there is no API key, the factory falls back
to `MockProvider` — the agent runs end-to-end with no external dependency.

The canonical list of vars (and their `sync: false` Render-dashboard wiring)
lives in [`render.yaml`](./render.yaml).

## Running locally

### MockProvider end-to-end (no DB, no API key)

```
pnpm install
pnpm --filter @mei/stylist local
```

Drives `runStella` against `MockProvider` with an in-memory
`IConversationStore`. Prints the SSE event stream to stdout.

### HTTP server for manual smoke testing

```
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_JWT_SECRET=...
# ANTHROPIC_API_KEY optional — without it, MockProvider activates.
pnpm --filter @mei/stylist dev
```

Then:

```
curl -N -X POST http://localhost:8080/stella/conversations/$CONVO/messages \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"hi"}'
```

`-N` disables curl buffering so SSE frames stream as they arrive.

## Deploy

This branch ships `Dockerfile` + `render.yaml`. To go live:

1. In the Render dashboard, create a new Web Service from this repo,
   pointing at `services/stylist/Dockerfile`. The `render.yaml` will
   pre-fill plan/region/healthcheck.
2. Set the `sync: false` secrets (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
   `ANTHROPIC_API_KEY`) in the dashboard.
3. Push to `main` — Render auto-deploys via the GitHub linkage.

No Render IDs are committed; nothing here will trigger an unintended deploy.

## What this branch does NOT do

- Real weather / calendar integrations (placeholder values).
- Today's pick one-shot (SPEC §8.5).
- Real conversation summarization — `summarizeAndTruncate` keeps last 20.
- Bedrock fallback.
- Connect the Render service (config only — wire-up is manual).
