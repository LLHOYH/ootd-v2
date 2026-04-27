# @mei/mock-server

Local Node mock server that serves the `SPEC.md §7` API contract from
in-memory fixtures. It lets the mobile app develop against a real HTTP API
on `http://localhost:4000` without AWS, DynamoDB, S3, or Anthropic.

## Run

```bash
pnpm install                          # from repo root
pnpm --filter @mei/mock-server dev    # tsx watch — restarts on save
# or
pnpm --filter @mei/mock-server start  # one-shot
```

You'll see:

```
Mei mock server ready → http://localhost:4000  (token convention: `Bearer mock_<userId>`, e.g. `mock_u_sophia`)
```

`PORT` and `HOST` env vars override the defaults.

## Auth (dev tokens)

The real API uses Cognito. The mock uses a simpler convention:

```
Authorization: Bearer mock_<userId>
```

Anything starting with `mock_` is accepted; the suffix becomes
`request.userId`. The seeded demo user is **`u_sophia`** — token
**`mock_u_sophia`**. `/health` and `/auth/*` are open.

## Seeded state

Each restart seeds:

- 1 user (`u_sophia`, "Sophia Chen", Singapore)
- 15 closet items spanning all 7 categories (mirrors
  `apps/mobile/components/closet/mocks.ts`)
- 5 combinations including a "Today's pick" (`c_sunday_brunch`)
- 1 active hangout (`h_brunch_today`) with 3 members
- 5 friends + 2 non-friend discoverable users
- 1 inbound + 1 outbound friend request
- 1 OOTD post from Sophia + 5 from friends
- 7 chat threads (Stella pinned, 1 hangout, 1 group, 4 DMs) with seed messages
- 1 Stella conversation seeded with the same beats as
  `apps/mobile/components/stella/mocks.ts`

State is in-memory and resets on restart.

## Pointing the mobile app at it

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 pnpm mobile:web
```

When testing on a physical device, replace `localhost` with your machine's
LAN IP and start the server with `HOST=0.0.0.0` (the default).

## How it works

- **Fastify** (radix-tree routing, plugin model). Each route family lives
  in `src/routes/*.ts` as a Fastify plugin.
- **Zod validation** comes from `@mei/types` via a `routeOptions.config.schema`
  field per route. The `validate` preHandler reads schemas off that field
  and replies with the SPEC §7.1 error envelope on failure. Responses are
  also validated; failures log a warning but pass the body through, so
  contract drift is visible without breaking the dev loop.
- **Cursor pagination** uses `Buffer.from({ offset }).toString('base64url')`.
  Opaque to clients per SPEC §7.1.
- **Stella SSE** (POST `/stella/conversations/{convoId}/messages`) emits
  `message_start` → 5 `text_delta` events over ~1s → one `tool_call` event
  named `outfit_suggestion` carrying a `Combination` → `message_stop`. All
  events are validated against `StellaSseEvent` from `@mei/types`.

## Out of scope

- Real S3 — `/me/selfies` and `/closet/items/upload` return fake presigned
  URLs at `https://mock-mei-s3.local/...`. The mobile app can wire up
  the optimistic-state flow without actually uploading.
- Real Cognito — see auth section above.
- Chat live updates over WebSocket. (TODO: §7.3 says API Gateway WS API;
  implement once the mobile chat surface needs realtime.)
