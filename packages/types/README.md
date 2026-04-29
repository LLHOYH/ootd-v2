# @mei/types

Shared types for the Mei monorepo. Three layers, in increasing distance from
the database:

## 1. Generated DB types — `src/db.ts`

Output of `supabase gen types typescript` against the migrations in
`supabase/migrations/`. **Do not edit by hand.** The file carries an
`AUTO-GENERATED` header for a reason.

These types describe rows as Postgres returns them: `snake_case` columns,
nullable where the schema is nullable, enum literals exactly as declared in
SQL.

Use the convenience helpers re-exported from `src/index.ts`:

```ts
import type { Tables, TablesInsert, TablesUpdate } from '@mei/types';

type UserRow    = Tables<'users'>;
type UserInsert = TablesInsert<'users'>;
type UserUpdate = TablesUpdate<'users'>;
```

### Regenerating

```bash
# from the repo root, with the local Supabase stack running:
supabase start                          # if not already running
pnpm --filter @mei/types gen:db
```

The script verifies the supabase CLI is installed and that the local stack
is up before running. It writes `packages/types/src/db.ts` with the
`AUTO-GENERATED` header followed by the generator's output.

### CI drift guard

The `db-types-drift` job in `.github/workflows/ci.yml` runs on every PR. It
spins up a local Supabase stack, regenerates the types into a temp file, and
diffs against the committed `db.ts`. If they disagree, the job fails with:

> DB types drift detected. Run `pnpm --filter @mei/types gen:db` and commit.

Run `pnpm --filter @mei/types check:db` locally to reproduce the check.

## 2. Runtime-validated entity schemas — `src/entities.ts` and `src/contracts/*.ts`

Zod schemas matching `SPEC.md §6.2` (entities) and `SPEC.md §7` (API
request/response contracts). Use these at trust boundaries — anywhere
untrusted JSON crosses into the app (HTTP requests, AsyncStorage reads,
WebSocket payloads, etc.).

Inferred TypeScript types pair with the schemas:

```ts
import { UserSchema, type User } from '@mei/types';

const user = UserSchema.parse(await fetch('/me').then((r) => r.json()));
```

These are hand-written and `camelCase` — they describe the API surface, not
the underlying SQL rows.

## 3. Hand-written entity interfaces — `src/index.ts`

The TypeScript interfaces defined inline in `src/index.ts` are the original
shape from `SPEC.md §6.2`. They predate the Zod schemas and stay for now so
existing imports keep working. New code should generally prefer the Zod
inferred types or the generated row types from layer (1).

## Why three layers?

- **Layer 1 (db.ts)** is what Postgres actually has. It's the truth about
  storage, generated mechanically — never out of date relative to migrations
  because CI checks.
- **Layer 2 (entities.ts / contracts/)** is what the API exposes. It can
  diverge from layer 1: `camelCase`, derived fields (`reactions[]` on
  `OOTDPost`), and runtime validation.
- **Layer 3 (index.ts interfaces)** is documentation-shaped TS: the
  `SPEC.md §6.2` shapes as plain interfaces, no Zod machinery at the call
  site.
