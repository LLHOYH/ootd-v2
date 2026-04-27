# @mei/api

Mei main HTTP API. Single Node 20 Lambda behind API Gateway. See
[`SPEC.md §7`](../../SPEC.md) for the route surface, error envelope, and
auth conventions.

This branch (`feat/api-skeleton`) ships the **handler skeleton** only —
router, middleware, lib wrappers, and a `_health` route. Business endpoints
land in their own branches per `docs/feature-breakdown.md`.

## Architecture

```
src/
  index.ts             Lambda entrypoint — builds RequestContext, runs the router,
                       maps ApiError / ZodError to { error: { code, message } }.
  router.ts            Tiny matcher: HTTP method + path -> handler. Supports :param.
  context.ts           RequestContext + Handler types.
  errors.ts            ApiError + helpers.
  middleware/
    auth.ts            requireAuth(handler) — verifies a Cognito bearer token.
    validate.ts        validate({ body, query, params }, ctx) using Zod.
  lib/
    config.ts          Centralised env-var access (lazy + throws on missing).
    ddb.ts             DynamoDBDocumentClient + getItem/putItem/queryItems/...
    s3.ts              S3Client + presignedPut/presignedGet/headObject.
    cognito.ts         verifyIdToken / verifyAccessToken via aws-jwt-verify.
  handlers/
    _health.ts         GET /_health — { ok, version, time }. No auth.
  local/
    invoke.ts          Dev CLI to invoke the Lambda with a fake APIGW event.
```

### Request lifecycle

```
APIGW v2 event
  -> index.handler
  -> buildContext()                      (parse method/path/headers/body/query)
  -> router.match(method, path)          (404 if no match)
  -> [requireAuth]                       (optional, per route)
  -> [validate(schemas, ctx)]            (optional, per route)
  -> route handler -> { status, body }
  -> jsonResponse                        (or errorResponse on throw)
```

### Adding a route

1. Add a handler in `src/handlers/<feature>/<name>.ts`.
2. Append `{ method, path, handler }` (optionally wrapped in `requireAuth`)
   to the `routes` array in `src/index.ts`.
3. Validate input with Zod schemas from `@mei/types/contracts`.
4. Throw `ApiError` for 4xx; let unknown errors bubble (mapped to 500).

## Env vars

Read via `lib/config.ts` — never `process.env` directly. The CDK api-stack
(`feat/api-stack`) injects these at deploy time.

| Var                     | Required for                                  |
|-------------------------|-----------------------------------------------|
| `REGION`                | All AWS clients (defaults to `AWS_REGION` then `us-east-1`) |
| `TABLE_NAME`            | DDB single-table writes/reads                 |
| `BUCKET_CLOSET_RAW`     | Closet upload presigned PUTs                  |
| `BUCKET_CLOSET_TUNED`   | Closet display presigned GETs                 |
| `BUCKET_SELFIES`        | Selfie upload presigned PUTs (SSE-KMS)        |
| `BUCKET_OOTD`           | OOTD post presigned reads                     |
| `COGNITO_USER_POOL_ID`  | Bearer token verification                     |
| `COGNITO_CLIENT_ID`     | Bearer token verification (audience)          |
| `SERVICE_VERSION`       | Surfaced in `/_health` (defaults to `dev`)    |

Example `.env` for local invoke (only what `_health` actually needs):

```bash
SERVICE_VERSION=dev
# Other vars only get read when the route hits them.
```

## Local invoke

```bash
# /_health (no auth, no env vars required)
pnpm --filter @mei/api local -- --method GET --path /_health

# Authenticated route (later branches)
pnpm --filter @mei/api local -- --method GET --path /me \
  --auth "$COGNITO_ID_TOKEN"

# POST with a JSON body
pnpm --filter @mei/api local -- --method POST --path /closet/items \
  --body '{"name":"linen shirt"}' --auth "$COGNITO_ID_TOKEN"
```

Output is the raw APIGW response (status, headers, body) printed as JSON.

## Hand-off to `feat/api-stack`

The CDK `api-stack` branch will:

- Package this module (zip / esbuild bundle from `dist/`).
- Wire it as a single Lambda behind a `HttpApi`.
- Inject the env vars above from `data-stack` outputs.
- Attach IAM grants for the table + four buckets + the Cognito user pool
  (read JWKS only — no admin actions).

Until then, this package is invokable only via the local CLI above.

## Out of scope (this branch)

- Any business endpoint beyond `_health` — those land per
  `docs/feature-breakdown.md`.
- API Gateway / Lambda CDK constructs.
- SAM / serverless.yml.
- SSM / Secrets Manager wiring.
