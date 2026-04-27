// Environment configuration for the Stella Lambda.
// Required: TABLE_NAME, REGION. Optional: ANTHROPIC_API_KEY, STELLA_LLM_MODE.
//
// We throw early on missing required vars so the Lambda cold-start fails loudly
// rather than producing a half-initialized agent. The factory consults the
// optional vars to decide whether to instantiate Anthropic or fall back to
// MockProvider.

export type StellaLlmMode = 'real' | 'mock';

export interface StellaConfig {
  tableName: string;
  region: string;
  anthropicApiKey?: string;
  llmMode: StellaLlmMode;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function loadConfig(): StellaConfig {
  const tableName = requireEnv('TABLE_NAME');
  const region = requireEnv('REGION');
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const rawMode = process.env.STELLA_LLM_MODE;

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
    tableName,
    region,
    anthropicApiKey,
    llmMode,
  };
}
