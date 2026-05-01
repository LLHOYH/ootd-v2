// Environment configuration for the image-worker service.
//
// Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: ANTHROPIC_API_KEY (vision tagging — falls back to MockVision),
//           REPLICATE_API_TOKEN (background removal + studio light — falls
//           back to MockImageProcess that copies raw to tuned untouched),
//           IMAGE_WORKER_MODE = 'mock' | 'real' (force one or the other),
//           IMAGE_WORKER_WEBHOOK_SECRET (HMAC secret to verify Supabase
//             database webhooks; if unset, signature checks are skipped —
//             intended for local dev only),
//           PORT (default 8090 — 8081 is Expo's web port; keep them
//             apart so the worker and the mobile dev server can both
//             run on the same machine),
//           LOG_LEVEL (default info).

export type ImageWorkerMode = 'real' | 'mock';

export interface ImageWorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  anthropicApiKey?: string;
  replicateApiToken?: string;
  mode: ImageWorkerMode;
  webhookSecret?: string;
  logLevel?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadConfig(): ImageWorkerConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const replicateApiToken = process.env.REPLICATE_API_TOKEN;
  const rawMode = process.env.IMAGE_WORKER_MODE;
  const webhookSecret = process.env.IMAGE_WORKER_WEBHOOK_SECRET;
  const logLevel = process.env.LOG_LEVEL;

  let mode: ImageWorkerMode;
  if (rawMode === 'mock') mode = 'mock';
  else if (rawMode === 'real') mode = 'real';
  else if (anthropicApiKey || replicateApiToken) mode = 'real';
  else mode = 'mock';

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    anthropicApiKey,
    replicateApiToken,
    mode,
    webhookSecret,
    logLevel,
  };
}
