// Environment configuration for the Stella HTTP service.
//
// Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
// Optional: ANTHROPIC_API_KEY, STELLA_LLM_MODE, LOG_LEVEL.
//
// We throw early on missing required vars so the service fails to boot rather
// than serving requests with a half-initialised agent. The factory consults
// the optional vars to decide whether to instantiate Anthropic or fall back
// to MockProvider.
//
// PORT is read in src/index.ts (transport-layer concern, not config).

export type StellaLlmMode = 'real' | 'mock';

export interface StylistConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseJwtSecret: string;
  anthropicApiKey?: string;
  llmMode: StellaLlmMode;
  logLevel?: string;
}

// Back-compat alias — earlier code imported `StellaConfig`. Both names refer
// to the same shape.
export type StellaConfig = StylistConfig;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function loadConfig(): StylistConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseJwtSecret = requireEnv('SUPABASE_JWT_SECRET');
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const rawMode = process.env.STELLA_LLM_MODE;
  const logLevel = process.env.LOG_LEVEL;

  let llmMode: StellaLlmMode;
  if (rawMode === 'mock') {
    llmMode = 'mock';
  } else if (rawMode === 'real') {
    llmMode = 'real';
  } else if (anthropicApiKey && anthropicApiKey.length > 0) {
    llmMode = 'real';
  } else {
    llmMode = 'mock';
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseJwtSecret,
    anthropicApiKey,
    llmMode,
    logLevel,
  };
}
