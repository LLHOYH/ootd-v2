// Centralised env-var access. The CDK api-stack will inject these at deploy
// time; locally they come from the shell or a `.env` loaded by the caller.
//
// Each getter reads `process.env` *at call time* and throws if missing — so
// `local invoke` against `/_health` doesn't fail just because, say,
// `BUCKET_SELFIES` isn't set. Callers ask only for what they need.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

export const config = {
  /** AWS region. Falls back to `AWS_REGION` (Lambda standard) then `us-east-1`. */
  get region(): string {
    return optional('REGION') ?? optional('AWS_REGION') ?? 'us-east-1';
  },

  /** DynamoDB single-table name. */
  get tableName(): string {
    return required('TABLE_NAME');
  },

  // S3 bucket names — see infra/lib/stacks/data-stack.ts outputs.
  get bucketClosetRaw(): string {
    return required('BUCKET_CLOSET_RAW');
  },
  get bucketClosetTuned(): string {
    return required('BUCKET_CLOSET_TUNED');
  },
  get bucketSelfies(): string {
    return required('BUCKET_SELFIES');
  },
  get bucketOotd(): string {
    return required('BUCKET_OOTD');
  },

  // Supabase. Replaces Cognito (SPEC §3.1, §7.1).
  //
  //   SUPABASE_URL              project URL (https://<ref>.supabase.co or
  //                             http://127.0.0.1:54321 for local).
  //   SUPABASE_ANON_KEY         publishable key — fine to bundle into the
  //                             mobile client; included here so the API can
  //                             mint per-request RLS clients without holding
  //                             the service key.
  //   SUPABASE_SERVICE_ROLE_KEY service-role key — bypasses RLS. Used by
  //                             admin paths (image-worker, notifier, the
  //                             auth-trigger seed). Never log this.
  //   SUPABASE_JWT_SECRET       Legacy HS256 signing secret — only present
  //                             on older projects. New projects sign with
  //                             ES256 and the auth middleware verifies via
  //                             the JWKS endpoint instead. Optional.
  get supabaseUrl(): string {
    return required('SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return required('SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get supabaseJwtSecret(): string | undefined {
    return optional('SUPABASE_JWT_SECRET');
  },

  /** Service version — surfaced in `/_health`. */
  get serviceVersion(): string {
    return optional('SERVICE_VERSION') ?? 'dev';
  },
};

export type Config = typeof config;
